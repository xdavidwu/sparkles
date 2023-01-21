<script lang="ts" setup>
import {
  VTable,
} from 'vuetify/components';
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import '@/vendor/wasm_exec';

const { selectedNamespace } = storeToRefs(useNamespaces());

const releases = ref<Array<any>>([]);

let goInitialized = false;

const setupGo = async () => {
  if (goInitialized) {
    return;
  }

  // eslint-disable-next-line no-undef
  const go = new Go();
  const wasm = await WebAssembly.instantiateStreaming(
    fetch('helm.wasm'), go.importObject);
  go.run(wasm.instance);
  goInitialized = true;
};

watch(selectedNamespace, async (namespace) => {
  if (!namespace || namespace.length === 0) {
    return;
  }
  await setupGo();
  // eslint-disable-next-line no-undef
  releases.value = JSON.parse(await listReleasesForNamespace(namespace));
}, { immediate: true });
</script>

<template>
  <VTable hover>
    <thead>
      <tr>
        <th>Release</th>
        <th>Chart</th>
        <th>Version</th>
        <th>App Version</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="release in releases" :key="release.name">
        <td>{{ release.name }}</td>
        <td>{{ release.chart.metadata.name }}</td>
        <td>{{ release.chart.metadata.version }}</td>
        <td>{{ release.chart.metadata.appVersion }}</td>
        <td>{{ release.info.status }}</td>
      </tr>
    </tbody>
  </VTable>
</template>
