<script lang="ts" setup>
import {
  VBtn,
  VTab,
  VTable,
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
    basePath: import.meta.env.VITE_KUBERNETES_API,
    accessToken: token,
    impersonation: config.impersonation,
  });
};

const createTab = (release: any) => {
  const id = `${release.name}/${release.version}`;
  if (!tabs.value.find((t) => t.id === id)) {
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
      <VTable hover>
        <thead>
          <tr>
            <th>Release</th>
            <th>Chart</th>
            <th>Version</th>
            <th>App Version</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="release in releases" :key="release.name">
            <td>{{ release.name }}</td>
            <td>{{ release.chart.metadata.name }}</td>
            <td>{{ release.chart.metadata.version }}</td>
            <td>{{ release.chart.metadata.appVersion }}</td>
            <td>{{ release.info.status }}</td>
            <td class="text-no-wrap">
              <VBtn size="small" icon="mdi-cog"
                title="Values" variant="text"
                @click="createTab(release)" />
            </td>
          </tr>
        </tbody>
      </VTable>
    </VWindowItem>
    <VWindowItem v-for="tab in tabs" :key="tab.id" :value="tab.id">
      <YAMLViewer :data="tab.values" :schema="{ object: tab.schema }" />
    </VWindowItem>
  </VWindow>
</template>
