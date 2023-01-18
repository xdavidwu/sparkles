<script lang="ts" setup>
import {
  VBadge,
  VBtn,
  VIcon,
  VTab,
  VTable,
  VTabs,
  VWindow,
  VWindowItem
} from 'vuetify/components';
import ExecTerminal from '@/components/ExecTerminal.vue';
import KeyValueBadge from '@/components/KeyValueBadge.vue';
import LogViewer from '@/components/LogViewer.vue';
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

interface Tab {
  type: string,
  id: string,
}

interface ExecTab extends Tab {
  spec: ContainerSpec,
  title?: string,
  alerting: boolean,
  bellTimeoutID?: number,
}

interface LogTab extends Tab {
  spec: ContainerSpec,
}

const { selectedNamespace } = storeToRefs(useNamespaces());

const tab = ref('table');
const tabs = ref<Array<ExecTab | LogTab>>([]);
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
  tabs.value.splice(index, 1);
};

const createExecTab = (pod: string, container: string) => {
  const id = `terminal-${pod}/${container}`;
  tabs.value.push({ type: 'exec', id, spec: { pod, container }, alerting: false });
  tab.value = id;
};

const createLogTab = (pod: string, container: string) => {
  const id = `log-${pod}/${container}`;
  tabs.value.push({ type: 'log', id, spec: { pod, container } });
  tab.value = id;
};

const bell = (index: number) => {
  const bellingTab = tabs.value[index] as ExecTab;
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
    <template v-for="tab in tabs" :key="tab.id">
      <VTab v-if="tab.type === 'exec'" :value="tab.id"
        @click="() => (tab as ExecTab).alerting = false">
        <VBadge dot color="red" v-model="(tab as ExecTab).alerting">
          {{ (tab as ExecTab).title ?? `Terminal: ${tab.spec.pod}/${tab.spec.container}` }}
        </VBadge>
      </VTab>
      <VTab v-else :value="tab.id">{{ `Log: ${tab.spec.pod}/${tab.spec.container}` }}</VTab>
    </template>
  </VTabs>
  <VWindow v-model="tab">
    <VWindowItem value="table">
      <VTable hover>
        <thead>
          <tr>
            <th>
              Pod
              <KeyValueBadge k="annotation" v="value" />
              <KeyValueBadge k="label" v="value" pill />
            </th>
            <th>Container name</th>
            <th>Container image</th>
            <th>Ready</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="pod in pods" :key="uniqueKeyForObject(pod)">
            <tr v-for="(container, index) in pod.spec!.containers"
              :key="container.name">
              <td v-if="index === 0" :rowspan="pod.spec!.containers.length">
                {{ pod.metadata!.name }}
                <br />
                <KeyValueBadge v-for="(value, key) in pod.metadata!.annotations"
                  :key="key" :k="key as string" :v="value" />
                <br />
                <KeyValueBadge v-for="(value, key) in pod.metadata!.labels"
                  :key="key" :k="key as string" :v="value" pill />
              </td>
              <td>{{ container.name }}</td>
              <td>{{ container.image }}</td>
              <td>
                <VIcon
                  :icon="pod.status!.containerStatuses![index].ready ? 'mdi-check' : 'mdi-close'"
                  :color="pod.status!.containerStatuses![index].ready ? '' : 'red'" />
              </td>
              <td>
                <VBtn size="x-small" icon="mdi-console-line" color="info"
                  title="Terminal"
                  @click="createExecTab(pod.metadata!.name!, container.name)" />
                <VBtn size="x-small" icon="mdi-file-document" color="info"
                  title="Log"
                  @click="createLogTab(pod.metadata!.name!, container.name)" />
              </td>
            </tr>
          </template>
        </tbody>
      </VTable>
    </VWindowItem>
    <VWindowItem v-for="(tab, index) in tabs" :key="tab.id"
      :value="tab.id">
      <ExecTerminal v-if="tab.type === 'exec'"
        @title-changed="(title) => (tab as ExecTab).title = title"
        @bell="() => bell(index)"
        :container-spec="{ namespace: selectedNamespace, ...tab.spec}" />
      <LogViewer v-if="tab.type === 'log'"
        :container-spec="{ namespace: selectedNamespace, ...tab.spec}" />
      <VBtn @click="closeTab(index)">Close</VBtn>
    </VWindowItem>
  </VWindow>
</template>
