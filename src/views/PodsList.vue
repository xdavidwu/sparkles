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
import { CoreV1Api, type V1Pod, V1PodFromJSON } from '@/kubernetes-api/src';
import { uniqueKeyForObject } from '@/utils/keys';
import { listAndWatch } from '@/utils/watch';

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

let abortController: AbortController | null = null;

watch(selectedNamespace, async (namespace) => {
  if (!namespace || namespace.length === 0) {
    pods.value = [];
    return;
  }
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  const api = new CoreV1Api(await useApiConfig().getConfig());
  // TODO cancellation
  listAndWatch(pods, V1PodFromJSON,
    (opt) => api.listNamespacedPodRaw(opt), { namespace },
    { signal: abortController.signal });
}, { immediate: true });

const closeTab = (index: number) => {
  tab.value = 'table';
  tabs.value.splice(index, 1);
};

const createTab = (type: 'exec' | 'log', pod: string, container: string) => {
  const id = `${type}-${pod}/${container}`;
  if (!tabs.value.find((t) => t.id === id)) {
    if (type === 'exec') {
      tabs.value.push({ type, id, spec: { pod, container }, alerting: false });
    } else {
      tabs.value.push({ type, id, spec: { pod, container } });
    }
  }
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
    <VTab v-for="(tab, index) in tabs" :key="tab.id" :value="tab.id"
      @click="() => tab.type === 'exec' && ((tab as ExecTab).alerting = false)">
      <VBadge v-if="tab.type === 'exec'" dot color="red" v-model="(tab as ExecTab).alerting">
        {{ (tab as ExecTab).title ?? `Terminal: ${tab.spec.pod}/${tab.spec.container}` }}
      </VBadge>
      <template v-else>{{ `Log: ${tab.spec.pod}/${tab.spec.container}` }}</template>
      <VBtn size="x-small" icon="mdi-close" variant="plain" @click.stop="closeTab(index)" />
    </VTab>
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
            <th>Container</th>
            <th>Container image</th>
            <th>Ready</th>
            <th class="text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="pod in pods" :key="uniqueKeyForObject(pod)">
            <tr v-for="(container, index) in pod.status!.containerStatuses"
              :key="container.name">
              <td v-if="index === 0" :rowspan="pod.status!.containerStatuses!.length">
                {{ pod.metadata!.name }}
                <br />
                <KeyValueBadge v-for="(value, key) in pod.metadata!.annotations"
                  :key="key" :k="key as string" :v="value" />
                <br v-if="pod.metadata!.annotations" />
                <KeyValueBadge v-for="(value, key) in pod.metadata!.labels"
                  :key="key" :k="key as string" :v="value" pill />
              </td>
              <td>{{ container.name }}</td>
              <td>{{ container.image }}</td>
              <td>
                <VIcon
                  :icon="container.ready ? 'mdi-check' : 'mdi-close'"
                  :color="container.ready ? '' : 'red'" />
              </td>
              <td class="text-no-wrap">
                <VBtn size="small" icon="mdi-console-line"
                  title="Terminal" variant="text"
                  :disabled="!container.state!.running"
                  @click="createTab('exec', pod.metadata!.name!, container.name)" />
                <VBtn size="small" icon="mdi-file-document"
                  title="Log" variant="text"
                  @click="createTab('log', pod.metadata!.name!, container.name)" />
              </td>
            </tr>
          </template>
        </tbody>
      </VTable>
    </VWindowItem>
    <VWindowItem v-for="(tab, index) in tabs" :key="tab.id"
      :value="tab.id">
      <ExecTerminal v-if="tab.type === 'exec'"
        style="height: calc(100vh - 144px)"
        @title-changed="(title) => (tab as ExecTab).title = title"
        @bell="() => bell(index)"
        :container-spec="{ namespace: selectedNamespace, ...tab.spec}" />
      <LogViewer v-if="tab.type === 'log'"
        style="height: calc(100vh - 144px)"
        :container-spec="{ namespace: selectedNamespace, ...tab.spec}" />
    </VWindowItem>
  </VWindow>
</template>
