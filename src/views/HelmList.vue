<script lang="ts" setup>
import {
  VBtn,
  VDataTable,
  VDataTableRow,
  VTab,
  VTabs,
  VWindow,
  VWindowItem,
} from 'vuetify/components';
import YAMLViewer from '@/components/YAMLViewer.vue';
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useNamespaces } from '@/stores/namespaces';
import { PresentedError } from '@/utils/PresentedError';
import '@/vendor/wasm_exec';

interface ValuesTab {
  id: string,
  values: object,
  schema?: object,
}

const { selectedNamespace } = storeToRefs(useNamespaces());
const releases = ref<Array<any>>([]);
const tab = ref('table');
const tabs = ref<Array<ValuesTab>>([]);

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
    basePath: import.meta.env.VITE_KUBERNETES_API === '' ? document.location.origin : import.meta.env.VITE_KUBERNETES_API,
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
  if (!namespace || namespace.length === 0) {
    return;
  }
  await setupGo();
  try {
    releases.value = JSON.parse(await listReleasesForNamespace(namespace));
  } catch (e) {
    if (e instanceof Error) {
      throw new PresentedError(e.message);
    }
    throw e;
  }
}, { immediate: true });
</script>

<template>
  <VTabs v-model="tab">
    <VTab value="table">Releases</VTab>
    <VTab v-for="(tab, index) in tabs" :key="tab.id" :value="tab.id">
      Values: {{ tab.id }}
      <VBtn size="x-small" icon="mdi-close" variant="plain" @click.stop="closeTab(index)" />
    </VTab>
  </VTabs>
  <VWindow v-model="tab">
    <VWindowItem value="table">
      <VDataTable hover :items="releases" :headers="columns" :group-by="[{ key: 'name', order: 'asc'}]">
        <template #group-header='groupProps'>
          <VDataTableRow v-bind='{ ...groupProps, item: latestRevision(groupProps.item.items) }'>
            <template #[`item.data-table-group`]='{ value }'>
              <VBtn size="small" variant="text"
                :icon="groupProps.isGroupOpen(groupProps.item) ? '$expand' : '$next'"
                :disabled="groupProps.item.items.length == 1"
                @click="groupProps.toggleGroup(groupProps.item)" />
              {{ value }}
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
