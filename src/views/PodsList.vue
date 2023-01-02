<script lang="ts" setup>
import {
  VBtn,
  VTab,
  VTable,
  VTabs,
  VWindow,
  VWindowItem
} from 'vuetify/components';
import ExecTerminal from '@/components/ExecTerminal.vue';
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api, type V1Pod } from '@/kubernetes-api/src';
import { uniqueKeyForObject } from '@/utils/keys';

const { selectedNamespace } = storeToRefs(useNamespaces());

const tab = ref('table');
const execTabs = ref<Array<{ pod: string, container: string }>>([]);
const pods = ref<Array<V1Pod>>([]);

watch(selectedNamespace, async (namespace) => {
  if (!namespace || namespace.length === 0) {
    pods.value = [];
  }
  const api = new CoreV1Api(await useApiConfig().getConfig());
  pods.value = (await api.listNamespacedPod({ namespace })).items;
}, { immediate: true });

const closeTab = (index: number) => {
  tab.value = 'table';
  execTabs.value.splice(index, 1);
};

const createExecTab = (pod: string, container: string) => {
  execTabs.value.push({ pod, container });
  tab.value = `terminal-${pod}/${container}`;
};
</script>

<template>
  <VTabs v-model="tab">
    <VTab value="table">Pods</VTab>
    <VTab v-for="execTab in execTabs"
      :key="`${execTab.pod}/${execTab.container}`"
      :value="`terminal-${execTab.pod}/${execTab.container}`">
      Terminal: {{ `${execTab.pod}/${execTab.container}` }}
    </VTab>
  </VTabs>
  <VWindow v-model="tab">
    <VWindowItem value="table">
      <VTable hover>
        <thead>
          <tr>
            <th>Pod name</th>
            <th>Container name</th>
            <th>Container image</th>
            <th>Readiness</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="pod in pods" :key="uniqueKeyForObject(pod)">
            <tr v-for="(container, index) in pod.spec!.containers"
              :key="container.name">
              <td v-if="index === 0" :rowspan="pod.spec!.containers.length">
                {{ pod.metadata!.name }}
              </td>
              <td>{{ container.name }}</td>
              <td>{{ container.image }}</td>
              <td>{{ pod.status!.containerStatuses![index].ready }}</td>
              <td>
                <VBtn size="x-small" icon="mdi-console-line" color="info"
                  title="Terminal"
                  @click="createExecTab(pod.metadata!.name!, container.name)" />
              </td>
            </tr>
          </template>
        </tbody>
      </VTable>
    </VWindowItem>
    <VWindowItem v-for="(execTab, index) in execTabs"
      :key="`${execTab.pod}/${execTab.container}`"
      :value="`terminal-${execTab.pod}/${execTab.container}`">
      <ExecTerminal
        :container-spec="{ namespace: selectedNamespace, ...execTab}" />
      <VBtn @click="closeTab(index)">Close</VBtn>
    </VWindowItem>
  </VWindow>
</template>
