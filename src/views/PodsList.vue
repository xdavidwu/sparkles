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

interface ContainerSpec {
  pod: string,
  container: string,
}

interface ExecTab {
  id: string,
  spec: ContainerSpec,
  title?: string,
  alerting: boolean,
  bellTimeoutID?: number,
}

const { selectedNamespace } = storeToRefs(useNamespaces());

const tab = ref('table');
const execTabs = ref<Array<ExecTab>>([]);
const pods = ref<Array<V1Pod>>([]);

watch(selectedNamespace, async (namespace) => {
  if (!namespace || namespace.length === 0) {
    pods.value = [];
    return;
  }
  const api = new CoreV1Api(await useApiConfig().getConfig());
  pods.value = (await api.listNamespacedPod({ namespace })).items;
}, { immediate: true });

const closeTab = (index: number) => {
  tab.value = 'table';
  execTabs.value.splice(index, 1);
};

const createExecTab = (pod: string, container: string) => {
  const id = `terminal-${pod}/${container}`;
  execTabs.value.push({ id, spec: { pod, container }, alerting: false });
  tab.value = id;
};

const bell = (index: number) => {
  const bellingTab = execTabs.value[index];
  if (bellingTab.bellTimeoutID) {
    clearTimeout(bellingTab.bellTimeoutID);
  }
  bellingTab.alerting = true;
  bellingTab.bellTimeoutID = setTimeout(() => {
    bellingTab.bellTimeoutID = undefined;
    if (tab.value === bellingTab.id) {
      bellingTab.alerting = false;
    }
  }, 1000);
};
</script>

<template>
  <VTabs v-model="tab">
    <VTab value="table">Pods</VTab>
    <VTab v-for="execTab in execTabs" :key="execTab.id" :value="execTab.id"
      :prepend-icon="execTab.alerting ? 'mdi-alert-circle' : ''"
      @click="() => execTab.alerting = false">
      {{ execTab.title ?? `Terminal: ${execTab.spec.pod}/${execTab.spec.container}` }}
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
    <VWindowItem v-for="(execTab, index) in execTabs" :key="execTab.id"
      :value="execTab.id">
      <ExecTerminal @title-changed="(title) => execTab.title = title"
        @bell="() => bell(index)"
        :container-spec="{ namespace: selectedNamespace, ...execTab.spec}" />
      <VBtn @click="closeTab(index)">Close</VBtn>
    </VWindowItem>
  </VWindow>
</template>
