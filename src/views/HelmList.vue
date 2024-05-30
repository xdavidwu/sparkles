<script lang="ts" setup>
import {
  VBtn,
  VDataTable,
  VDataTableRow,
  VTab,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import TabsWindow from '@/components/TabsWindow.vue';
import TippedBtn from '@/components/TippedBtn.vue';
import WindowItem from '@/components/WindowItem.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import { onMounted, ref, watch } from 'vue';
import { computedAsync } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useNamespaces } from '@/stores/namespaces';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useAbortController } from '@/composables/abortController';
import { useAppTabs } from '@/composables/appTabs';
import { useLoading } from '@/composables/loading';
import { stringify, parseAllDocuments } from 'yaml';
import { CoreV1Api, type V1Secret, V1SecretFromJSON } from '@/kubernetes-api/src';
import { listAndUnwaitedWatch } from '@/utils/watch'
import { type Release, encodeSecret, parseSecret, secretsLabelSelector, Status } from '@/utils/helm';
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
const discoveryStore = useApisDiscovery();

const api = new CoreV1Api(await useApiConfig().getConfig());

const secrets = ref<Array<V1Secret>>([]);
const tab = ref('table');
const tabs = ref<Array<ValuesTab>>([]);

const releases = computedAsync(async () =>
  (await Promise.all(secrets.value.map(parseSecret))).sort((a, b) => {
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
  },
  {
    title: 'Revision',
    key: 'version',
  },
  {
    title: 'Chart',
    key: 'chart.metadata.name',
  },
  {
    title: 'Version',
    key: 'chart.metadata.version',
  },
  {
    title: 'App version',
    key: 'chart.metadata.appVersion',
  },
  {
    title: 'Status',
    key: 'info.status',
  },
  {
    title: 'Actions',
    key: 'actions',
    value: () => '',
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

const { loading, load } = useLoading(async () => {
  abortRequests();
  await listAndUnwaitedWatch(secrets, V1SecretFromJSON,
    (opt) => api.listNamespacedSecretRaw(
      { ...opt, namespace: selectedNamespace.value, labelSelector: secretsLabelSelector },
      { signal: signal.value },
    ),
    (e) => useErrorPresentation().pendingError = e,
  );
});

watch(selectedNamespace, load, { immediate: true });

const rollback = async (target: Release) => {
  const latest = releases.value.filter((r) => r.name == target.name)[0];

  // XXX: proxy, multiple layer
  const release = JSON.parse(JSON.stringify(target));
  release.info.last_deployed = (new Date()).toISOString();
  release.info.status = Status.PENDING_ROLLBACK;
  release.info.description = `Rollback to ${release.version}`;
  release.version = latest.version + 1;

  const secret = await encodeSecret(release);
  // TODO what should we set fieldmanager to?
  await api.createNamespacedSecret({ namespace: secret.metadata!.namespace!, body: secret });

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

  const ops = await Promise.all(targetResources.map((r) => ({
    op: latestResources.some((t) => isSameKubernetesObject(r, t)) ? 'replace' : 'create',
    target: r,
  })).concat(latestResources.filter(
    (r) => !targetResources.some((t) => isSameKubernetesObject(r, t)),
  ).map((r) => ({
    op: 'delete',
    target: r,
  }))).map(async (op) => ({
    ...op,
    kindInfo: await discoveryStore.getForObject(op.target),
  })));

  const summary = ops.map((o) =>
    `${o.op}: ${o.kindInfo.group ?? 'core'} ${o.kindInfo.version} ${o.kindInfo.resource} (${o.kindInfo.scope}) ${o.target.metadata!.name}`,
  ).join('\n');
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
  <TabsWindow v-model="tab">
    <WindowItem value="table">
      <VDataTable hover :items="releases" :headers="columns" :loading="loading"
        :row-props="{class: 'darken'}" :group-by="[{ key: 'name', order: 'asc'}]"
        hide-default-footer disable-sort>
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
  </TabsWindow>
</template>

<style scoped>
.chart-icon {
  max-height: 2em;
  max-width: 2em;
}

:deep(.darken) {
  background-color: rgba(var(--v-theme-background), var(--v-medium-emphasis-opacity));
}
</style>
