<script lang="ts" setup>
import {
  VBtn,
  VDataTable,
  VDataTableRow,
  VTab,
  VWindow,
  VWindowItem,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import YAMLViewer from '@/components/YAMLViewer.vue';
import { onMounted, ref, watch } from 'vue';
import { computedAsync } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useNamespaces } from '@/stores/namespaces';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useAbortController } from '@/composables/abortController';
import { CoreV1Api, type V1Secret, V1SecretFromJSON } from '@/kubernetes-api/src';
import { listAndWatch } from '@/utils/watch';
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
  const gzipped = Uint8Array.from(atob(atob(s.data?.release!)), (c) => c.codePointAt(0)!);
  const gunzip = new DecompressionStream('gzip');
  const w = gunzip.writable.getWriter();
  const write = async () => {
    await w.write(gzipped);
    await w.close();
  };
  write();
  const r = gunzip.readable.pipeThrough(new TextDecoderStream()).getReader();
  let json = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await r.read();

    if (done) {
      break;
    }

    json += value;
  }
  const release = JSON.parse(json);
  release.labels = s.metadata!.labels;
  return release;
}))).sort((a: any, b: any) => {
  if (a.chart.metadata.name !== b.chart.metadata.name) {
    return a.chart.metadata.name.localeCompare(b.chart.metadata.name);
  }
  return b.version - a.version;
}), []);

const columns = [
  {
    title: 'Release',
    key: 'data-table-group',
    value: (r: Record<string, any>) => r.name,
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
    title: 'Revision',
    key: 'version',
    sortable: false,
  },
  {
    title: 'Actions',
    key: 'actions',
    value: () => '',
    sortable: false,
    headerProps: {
      class: ['text-center'],
    },
    cellProps: {
      class: ['text-no-wrap'],
      width: 0,
    },
  },
];

const latestRevision = (releases: ReadonlyArray<any>) => releases.reduce(
  (a, v) => (v.raw.version > a.raw.version) ? v : a, releases[0]);

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
    fetch('helm.wasm'), go.importObject);
  go.run(wasm.instance);
  goInitialized = true;

  configConnection({
    basePath: config.fullApiBasePath,
    accessToken: token,
    impersonation: config.impersonation,
  });
};

const createTab = (release: any) => {
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
  listAndWatch(secrets, V1SecretFromJSON,
    (opt) => api.listNamespacedSecretRaw(opt, { signal: signal.value }),
    { namespace, labelSelector: 'owner=helm' })
      .catch((e) => useErrorPresentation().pendingError = e);
}, { immediate: true });

onMounted(setupGo);
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="table">Releases</VTab>
    <VTab v-for="(tab, index) in tabs" :key="tab.id" :value="tab.id">
      Values: {{ tab.id }}
      <VBtn size="x-small" icon="mdi-close" variant="plain" @click.stop="closeTab(index)" />
    </VTab>
  </AppTabs>
  <VWindow v-model="tab">
    <VWindowItem value="table">
      <VDataTable hover :items="releases" :headers="columns" :group-by="[{ key: 'name', order: 'asc'}]">
        <template #group-header='groupProps'>
          <VDataTableRow v-bind='{ ...groupProps, item: latestRevision(groupProps.item.items) }' class="group-header">
            <template #[`item.data-table-group`]='{ value }'>
              <VBtn size="small" variant="text"
                :icon="groupProps.isGroupOpen(groupProps.item) ? '$expand' : '$next'"
                :disabled="groupProps.item.items.length == 1"
                @click="groupProps.toggleGroup(groupProps.item)" />
              {{ value }}
            </template>
            <template #[`item.chart.metadata.name`]='{ item, value }'>
              <div :title="(item as any).chart.metadata.description" class="d-flex align-center">
                <img :src="(item as any).chart.metadata.icon" class="chart-icon mr-2" />
                {{ value }}
              </div>
            </template>
            <template #[`item.actions`]='{ item }'>
              <VBtn size="small" icon="mdi-file-document" title="Values" variant="text"
                @click="createTab(item)" />
            </template>
          </VDataTableRow>
        </template>
        <template #[`item.data-table-group`]>
          <VBtn size="small" variant="text" disabled icon="mdi-circle-small" />
        </template>
        <template #[`item.chart.metadata.name`]='{ item, value }'>
          <div :title="(item as any).chart.metadata.description" class="d-flex align-center">
            <img :src="(item as any).chart.metadata.icon" class="chart-icon mr-2" />
            {{ value }}
          </div>
        </template>
        <template #[`item.actions`]='{ item }'>
          <VBtn size="small" icon="mdi-file-document" title="Values" variant="text"
            @click="createTab(item)" />
        </template>
        <template #bottom />
      </VDataTable>
    </VWindowItem>
    <VWindowItem v-for="tab in tabs" :key="tab.id" :value="tab.id">
      <YAMLViewer :data="tab.values" :schema="{ object: tab.schema }" />
    </VWindowItem>
  </VWindow>
</template>

<style scoped>
.chart-icon {
  max-height: 2em;
  max-width: 2em;
}

:deep(tr) {
  opacity: var(--v-medium-emphasis-opacity);
}

tr.group-header {
  opacity: 1;
}
</style>
