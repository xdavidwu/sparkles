<script lang="ts" setup>
import {
  VBtn,
  VDataTable,
  VIcon,
  VTab,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import ExecTerminal from '@/components/ExecTerminal.vue';
import HumanDurationSince from '@/components/HumanDurationSince.vue';
import KeyValueBadge from '@/components/KeyValueBadge.vue';
import LogViewer from '@/components/LogViewer.vue';
import LinkedImage from '@/components/LinkedImage.vue';
import TabsWindow from '@/components/TabsWindow.vue';
import TippedBtn from '@/components/TippedBtn.vue';
import WindowItem from '@/components/WindowItem.vue';
import { ref, watch } from 'vue';
import { useAbortController } from '@/composables/abortController';
import { useAppTabs } from '@/composables/appTabs';
import { useLoading } from '@/composables/loading';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import { useApiConfig } from '@/stores/apiConfig';
import {
  CoreV1Api,
  type V1Pod, V1PodFromJSON, type V1Container, type V1ContainerStatus, type V1EphemeralContainer,
} from '@xdavidwu/kubernetes-client-typescript-fetch';
import { truncateStart } from '@/utils/text';
import { listAndUnwaitedWatch } from '@/utils/watch';
import { notifyListingWatchErrors } from '@/utils/errors';

interface ContainerSpec {
  pod: string,
  container: string,
}

interface Tab {
  type: 'exec' | 'log',
  id: string,
  spec: ContainerSpec,
  title?: string,
  defaultTitle: string,
  description: string,
  alerting: boolean,
  bellTimeoutID?: ReturnType<typeof setTimeout>,
}

type ContainerData = (V1Container | V1EphemeralContainer) & Partial<V1ContainerStatus>;

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces;
const { selectedNamespace } = storeToRefs(namespacesStore);

const api = new CoreV1Api(await useApiConfig().getConfig());

const tab = ref('table');
const tabs = ref<Array<Tab>>([]);
const pods = ref<Array<V1Pod>>([]);
const expanded = ref<Array<string>>([]);

const { appBarHeightPX } = useAppTabs();

const columns = [
  {
    title: 'Name',
    key: 'metadata.name',
  },
  {
    title: 'IPs',
    key: 'status.podIPs',
    value: (pod: V1Pod) => pod.status?.podIPs?.map((a) => a.ip).join(', '),
  },
  {
    title: 'Node',
    key: 'spec.nodeName',
  },
  {
    title: 'Phase',
    key: 'status.phase',
  },
];

const innerColumns = [
  {
    title: 'Container',
    key: 'name',
  },
  {
    title: 'Image',
    key: 'image',
  },
  {
    title: 'State',
    key: `state`,
    value: (c: ContainerData) =>
      c.state?.waiting ? `Waiting: ${c.state.waiting.reason}` :
      c.state?.running ? `Running: ${c.ready ? 'Ready' : 'Unready'}` :
      c.state?.terminated ? `Terminated: Status ${c.state.terminated.exitCode}` : 'Unknown',
  },
  {
    title: 'Restarts',
    key: 'restartCount',
  },
  {
    title: 'Actions',
    key: 'actions',
    value: () => '',
    sortable: false,
    nowrap: true,
    width: 0,
    cellProps: {
      class: 'ps-1',
    },
  },
];

const { abort: abortRequests, signal } = useAbortController();

const { load, loading } = useLoading(async () => {
  abortRequests();

  await listAndUnwaitedWatch(pods, V1PodFromJSON,
    (opt) => api.listNamespacedPodRaw({ ...opt, namespace: selectedNamespace.value }, { signal: signal.value }),
    notifyListingWatchErrors,
  );
});

watch(selectedNamespace, load, { immediate: true });

const mergeContainerSpecStatus = (pod: V1Pod): Array<ContainerData & { type?: string }> =>
  pod.spec!.containers.map((c) => ({
    ...c,
    ...pod.status?.containerStatuses?.find((s) => s.name == c.name),
  })).concat(pod.spec!.initContainers?.map((c) => ({
    ...c,
    ...pod.status?.initContainerStatuses?.find((s) => s.name == c.name),
    type: c.restartPolicy == 'Always' ? 'sidecar' : 'init',
  })) ?? []).concat(pod.spec!.ephemeralContainers?.map((c) => ({
    ...c,
    ...pod.status?.ephemeralContainerStatuses?.find((s) => s.name == c.name),
    type: c.targetContainerName ? `ephemeral, targeting ${c.targetContainerName}` : 'ephemeral',
  })) ?? []);

const closeTab = (index: number) => {
  tab.value = 'table';
  tabs.value.splice(index, 1);
};

const createTab = (type: 'exec' | 'log', target: ContainerData, pod: V1Pod) => {
  const podName = pod.metadata!.name!;
  const containerName = target.name;
  const id = type === 'log' ? `${podName}/${containerName}` : crypto.randomUUID();
  if (!tabs.value.some((t) => t.id === id)) {
    const isOnlyContainer = pod.status?.containerStatuses!.length === 1;
    const name = isOnlyContainer ? truncateStart(podName, 8) : `${truncateStart(podName, 8)}/${containerName}`;
    const fullName = `${podName}/${containerName}`;
    tabs.value.push({
      type, id, spec: { pod: podName, container: containerName }, alerting: false,
      defaultTitle: `${type === 'exec' ? 'Terminal' : 'Log'}: ${name}`,
      description: `${type === 'exec' ? 'Terminal' : 'Log'}: ${fullName}`,
    });
  }
  tab.value = id;
};

const bell = (index: number) => {
  const bellingTab = tabs.value[index];
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

const toggleExpandAll = (expand: boolean) => expand ?
  (expanded.value = pods.value.map((p) => p.metadata!.name!)) :
  (expanded.value = []);
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="table">Pods</VTab>
    <DynamicTab v-for="(tab, index) in tabs" :key="tab.id" :value="tab.id"
      :title="tab.title ?? tab.defaultTitle" :description="tab.description"
      @click="() => tab.alerting = false" @close="() => closeTab(index)" />
  </AppTabs>
  <TabsWindow v-model="tab">
    <WindowItem value="table">
      <VDataTable :items="pods" :headers="columns" :loading="loading"
        v-model:expanded="expanded"
        item-value="metadata.name" expand-on-click show-expand>
        <template #[`header.metadata.name`]="{ column, getSortIcon }">
          <div class="v-data-table-header__content">
            {{ column.title }}
            <KeyValueBadge k="annotation" v="value" class="ms-1" />
            <KeyValueBadge k="label" v="value" class="ms-1" pill />
            <VIcon v-if="column.sortable" key="icon" class="v-data-table-header__sort-icon" :icon="getSortIcon(column)" />
          </div>
        </template>
        <template #[`header.data-table-expand`]>
          <VBtn
            :icon="`mdi-chevron-double-${expanded.length === pods.length ? 'up' : 'down'}`"
            size="small" variant="text"
            @click="toggleExpandAll(expanded.length !== pods.length)" />
        </template>
        <template #[`item.metadata.name`]="{ item: pod, value }">
          <div class="my-2">
            {{ value }}
            <br />
            <KeyValueBadge v-for="(value, key) in pod.metadata!.annotations"
              class="mr-1 mb-1"
              :key="key" :k="key as string" :v="value" />
            <br v-if="pod.metadata!.annotations" />
            <KeyValueBadge v-for="(value, key) in pod.metadata!.labels"
              class="mr-1 mb-1"
              :key="key" :k="key as string" :v="value" pill />
          </div>
        </template>
        <template #expanded-row="{ columns, item: pod }">
          <tr>
            <td class="inner-table py-3 no-hover" :colspan="columns.length">
              <VDataTable class="bg-transparent"
                :items="mergeContainerSpecStatus(pod)"
                :headers="innerColumns" density="compact">
                <template #[`item.name`]="{ item, value }">
                  {{ value }}
                  <template v-if="item.type">
                    ({{ item.type }})
                  </template>
                </template>
                <template #[`item.image`]="{ item, value }">
                  <LinkedImage :image="value" :id="item.imageID" />
                </template>
                <template #[`item.restartCount`]="{ item, value }">
                  {{ value }}
                  <template v-if="value && item.lastState?.terminated?.finishedAt">
                    (<HumanDurationSince :since="item.lastState.terminated.finishedAt" ago />)
                  </template>
                </template>
                <template #[`item.actions`]="{ item }">
                  <!-- TODO bring permission check back? -->
                  <TippedBtn size="small" icon="mdi-console-line"
                    tooltip="Terminal" variant="text"
                    :disabled="!item.state?.running"
                    @click="createTab('exec', item, pod)" />
                  <TippedBtn size="small" icon="mdi-file-document"
                    tooltip="Log" variant="text"
                    @click="createTab('log', item, pod)" />
                </template>
              </VDataTable>
            </td>
          </tr>
        </template>
      </VDataTable>
    </WindowItem>
    <WindowItem v-for="(tab, index) in tabs" :key="tab.id"
      :value="tab.id">
      <component :is="tab.type === 'exec' ? ExecTerminal : LogViewer"
        :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`"
        @title-changed="(title: string) => tab.title = title"
        @bell="() => bell(index)"
        :container-spec="{ namespace: selectedNamespace, ...tab.spec}" />
    </WindowItem>
  </TabsWindow>
</template>

<style scoped>
.inner-table {
  background-color: rgba(var(--v-theme-background), var(--v-medium-emphasis-opacity));
}

.no-hover:after {
  background-color: transparent !important;
}
</style>
