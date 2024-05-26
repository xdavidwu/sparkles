<script lang="ts" setup>
import {
  VBtn,
  VDataTable,
  VDataTableRow,
  VTab,
  VWindow,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import TippedBtn from '@/components/TippedBtn.vue';
import WindowItem from '@/components/WindowItem.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import { onMounted, ref, watch } from 'vue';
import { computedAsync } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useNamespaces } from '@/stores/namespaces';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useAbortController } from '@/composables/abortController';
import { useAppTabs } from '@/composables/appTabs';
import { stringify, parseAllDocuments } from 'yaml';
import { CoreV1Api, type V1Secret, V1SecretFromJSON } from '@/kubernetes-api/src';
import { listAndUnwaitedWatch } from '@/utils/watch'
import type { Release, ReleaseWithLabels } from '@/utils/helm';
import { type KubernetesObject, isSameKubernetesObject } from '@/utils/objects';
import '@/vendor/wasm_exec';

interface ValuesTab {
  id: string,
  values: object,
  schema?: object,
}

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces();
const { selectedNamespace } = storeToRefs(namespacesStore);

const api = new CoreV1Api(await useApiConfig().getConfig());

const secrets = ref<Array<V1Secret>>([]);
const tab = ref('table');
const tabs = ref<Array<ValuesTab>>([]);

// helm.sh/helm/v3/pkg/storage/driver.Secrets.List
const releases = computedAsync(async () => (await Promise.all(secrets.value.map(async (s) => {
  // TODO handle malformed secrets
  const gzipped = (await fetch(
    `data:application/octet-stream;base64,${atob(s.data?.release!)}`,
  )).body!;
  const stream = gzipped.pipeThrough(new DecompressionStream('gzip'));

  const release: Release = await (new Response(stream)).json();
  return {
    ...release,
    labels: s.metadata!.labels,
  } as ReleaseWithLabels;
}))).sort((a, b) => {
  if (a.chart.metadata.name !== b.chart.metadata.name) {
    return a.chart.metadata.name.localeCompare(b.chart.metadata.name);
  }
  return b.version - a.version;
}), []);

const columns = [
  {
    title: 'Release',
    key: 'data-table-group',
    value: (r: Release) => r.name,
    sortable: false,
  },
  {
    title: 'Revision',
    key: 'version',
    sortable: false,
  },
  {
    title: 'Chart',
    key: 'chart.metadata.name',
    sortable: false,
  },
  {
    title: 'Version',
    key: 'chart.metadata.version',
    sortable: false,
  },
  {
    title: 'App version',
    key: 'chart.metadata.appVersion',
    sortable: false,
  },
  {
    title: 'Status',
    key: 'info.status',
    sortable: false,
  },
  {
    title: 'Actions',
    key: 'actions',
    value: () => '',
    sortable: false,
    nowrap: true,
    width: 0,
    headerProps: {
      class: ['text-center'],
    },
  },
];

const latestRevision = (releases: ReadonlyArray<any>) => releases.reduce(
  (a, v) => (v.raw.version > a.raw.version) ? v : a, releases[0]);

const { appBarHeightPX } = useAppTabs();

const { abort: abortRequests, signal } = useAbortController();

let goInitialized = false;

const setupGo = async () => {
  if (goInitialized) {
    return;
  }
  const config = useApiConfig();
  const token = await config.getBearerToken();

  const go = new Go();
  const wasm = await WebAssembly.instantiateStreaming(
    fetch(`${window.__base_url}helm.wasm`), go.importObject);
  go.run(wasm.instance);
  goInitialized = true;

  configConnection({
    basePath: config.fullApiBasePath,
    accessToken: token,
    impersonation: config.impersonation,
  });
};

const createTab = (release: Release) => {
  const id = `${release.name}@${release.version}`;
  if (!tabs.value.some((t) => t.id === id)) {
    tabs.value.push({
      id,
      schema: release.chart.schema ? JSON.parse(atob(release.chart.schema)) : undefined,
      values: release.config ?? {},
    });
  }
  tab.value = id;
};

const closeTab = (idx: number) => {
  tab.value = 'table';
  tabs.value.splice(idx, 1);
};

watch(selectedNamespace, async (namespace) => {
  if (namespace === '') {
    return;
  }
  abortRequests();
  await listAndUnwaitedWatch(secrets, V1SecretFromJSON,
    (opt) => api.listNamespacedSecretRaw(
      { ...opt, namespace, labelSelector: 'owner=helm' },
      { signal: signal.value },
    ),
    (e) => useErrorPresentation().pendingError = e,
  );
}, { immediate: true });

const rollback = (target: Release) => {
  const latest = releases.value.filter((r) => r.name == target.name)[0];

  // TODO create release object

  const targetResources = parseAllDocuments(target.manifest).map((d) => d.toJS() as KubernetesObject);
  const latestResources = parseAllDocuments(latest.manifest).map((d) => d.toJS() as KubernetesObject);

  targetResources.forEach((r) => {
    if (!r.metadata!.annotations) {
      r.metadata!.annotations = {};
    }
    if (!r.metadata!.labels) {
      r.metadata!.labels = {};
    }
    r.metadata!.labels['app.kubernetes.io/managed-by'] = 'Helm';
    r.metadata!.annotations['meta.helm.sh/release-name'] = target.name;
    r.metadata!.annotations['meta.helm.sh/release-namespace'] = target.namespace;
  });

  const ops = [];
  targetResources.forEach((r) => {
    if (latestResources.some((t) => isSameKubernetesObject(r, t))) {
      ops.push({
        op: 'replace',
        target: r,
      });
    } else {
      ops.push({
        op: 'create',
        target: r,
      });
    }
  });
  ops.push(
    ...latestResources.filter(
      (r) => !targetResources.some((t) => isSameKubernetesObject(r, t)),
    ).map((r) => ({
      op: 'delete',
      target: r,
    })),
  );
  const summary = ops.map((o) => `${o.op}: ${o.target.apiVersion} ${o.target.kind} ${o.target.metadata!.name}`).join('\n');
  alert(`TODO rollback from ${latest.version} to ${target.version}:\n${summary}`);
  console.log(ops);
  // TODO recreate? (delete old pod to trigger a rollout?), wait?, hooks?
  // TODO set all existing versions to superseded
  // TODO persist new release
  // TODO history retention
};

onMounted(setupGo);
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="table">Releases</VTab>
    <DynamicTab v-for="(tab, index) in tabs" :key="tab.id" :value="tab.id"
      :title="`Values: ${ tab.id }`" @close="() => closeTab(index)" />
  </AppTabs>
  <VWindow v-model="tab" :touch="false">
    <WindowItem value="table">
      <VDataTable hover :items="releases" :headers="columns"
        :group-by="[{ key: 'name', order: 'asc'}]" hide-default-footer>
        <template #group-header='groupProps'>
          <VDataTableRow v-bind='{ ...groupProps, item: latestRevision(groupProps.item.items) }' class="group-header">
            <template #[`item.data-table-group`]='{ value }'>
              <VBtn size="small" variant="text"
                :icon="groupProps.isGroupOpen(groupProps.item) ? '$expand' : '$next'"
                :disabled="groupProps.item.items.length == 1"
                @click="groupProps.toggleGroup(groupProps.item)" />
              {{ value }}
            </template>
            <template #[`item.version`]='{ item, value }'>
              <span>
                {{ value }}
                <LinkedTooltip :text="`Last deployed: ${new Date((item as Release).info.last_deployed!)}`" activator="parent" />
              </span>
            </template>
            <template #[`item.chart.metadata.name`]='{ item, value }'>
              <div class="d-flex align-center">
                <img :src="(item as Release).chart.metadata.icon" class="chart-icon mr-2" />
                {{ value }}
                <LinkedTooltip
                  v-if="(item as Release).chart.metadata.description"
                  :text="(item as Release).chart.metadata.description!"
                  activator="parent" />
              </div>
            </template>
            <template #[`item.actions`]='{ item }'>
              <TippedBtn size="small" icon="mdi-file-document" tooltip="Values" variant="text"
                @click="() => createTab(item as Release)" />
            </template>
          </VDataTableRow>
        </template>
        <template #[`item.data-table-group`]>
          <VBtn size="small" variant="text" disabled icon="mdi-circle-small" />
        </template>
        <template #[`item.version`]='{ item, value }'>
          <span>
            {{ value }}
            <LinkedTooltip :text="`Last deployed: ${new Date(item.info.last_deployed!)}`" activator="parent" />
          </span>
        </template>
        <template #[`item.chart.metadata.name`]='{ item, value }'>
          <div class="d-flex align-center">
            <img :src="item.chart.metadata.icon" class="chart-icon mr-2" />
            {{ value }}
            <LinkedTooltip v-if="item.chart.metadata.description"
              :text="item.chart.metadata.description" activator="parent" />
          </div>
        </template>
        <template #[`item.actions`]='{ item }'>
          <TippedBtn size="small" icon="mdi-file-document" tooltip="Values" variant="text"
            @click="() => createTab(item)" />
          <TippedBtn v-if="item.info.status == 'superseded'" size="small"
            icon="mdi-reload" tooltip="Rollback" variant="text" @click="() => rollback(item)" />
        </template>
      </VDataTable>
    </WindowItem>
    <WindowItem v-for="tab in tabs" :key="tab.id" :value="tab.id">
      <YAMLEditor :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`"
        :model-value="stringify(tab.values, null, { indentSeq: true })"
        :schema="tab.schema" disabled />
    </WindowItem>
  </VWindow>
</template>

<style scoped>
.chart-icon {
  max-height: 2em;
  max-width: 2em;
}

:deep(tbody > tr) {
  background-color: rgb(var(--v-theme-background));
}

tr.group-header {
  background-color: unset;
}
</style>
