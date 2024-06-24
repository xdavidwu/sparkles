<script lang="ts" setup>
import {
  VDataTable,
  VIcon,
  VTab,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import ExecTerminal from '@/components/ExecTerminal.vue';
import KeyValueBadge from '@/components/KeyValueBadge.vue';
import LogViewer from '@/components/LogViewer.vue';
import LinkedImage from '@/components/LinkedImage.vue';
import TabsWindow from '@/components/TabsWindow.vue';
import TippedBtn from '@/components/TippedBtn.vue';
import WindowItem from '@/components/WindowItem.vue';
import { computed, ref, watch } from 'vue';
import { computedAsync } from '@vueuse/core';
import { useAbortController } from '@/composables/abortController';
import { useAppTabs } from '@/composables/appTabs';
import { useLoading } from '@/composables/loading';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import { useApiConfig } from '@/stores/apiConfig';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { usePermissions } from '@/stores/permissions';
import {
  CoreV1Api,
  type V1Pod, V1PodFromJSON, type V1Container, type V1ContainerStatus,
} from '@/kubernetes-api/src';
import { truncateStart } from '@/utils/text';
import { listAndUnwaitedWatch } from '@/utils/watch';

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

type _ContainerData = V1Container & V1ContainerStatus;

interface ContainerData extends _ContainerData {
  _extra: {
    pod: V1Pod,
    mayReadLogs?: boolean,
    mayExec?: boolean,
  },
}

const { mayAllows } = usePermissions();

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces;
const { selectedNamespace } = storeToRefs(namespacesStore);

const api = new CoreV1Api(await useApiConfig().getConfig());

const tab = ref('table');
const tabs = ref<Array<Tab>>([]);
const _pods = ref<Array<V1Pod>>([]);
const _containers = computed<Array<ContainerData>>(() =>
  _pods.value.reduce(
    (a, v) => a.concat(v.spec!.containers.map((c) =>
      ({
        ...c,
        ...v.status!.containerStatuses?.find((s) => s.name == c.name),
        _extra: { pod: v },
      } as ContainerData))),
    [] as Array<ContainerData>,
  ));
// XXX: this updates once all settles
const containers = computedAsync(async () => Promise.all(_containers.value.map(async (c) => ({
  ...c,
  _extra: {
    pod: c._extra.pod,
    mayReadLogs: await mayAllows(selectedNamespace.value, '', 'pods/log', c._extra.pod.metadata!.name!, 'get'),
    mayExec: await mayAllows(selectedNamespace.value, '', 'pods/exec', c._extra.pod.metadata!.name!, 'create'),
  },
}))), _containers.value);

const { appBarHeightPX } = useAppTabs();

const columns = [
  {
    title: 'Pod',
    key: '_extra.pod.metadata.name',
    // XXX: reconsider this?
    cellProps: ({ item }: { item: ContainerData }) => ({
      rowspan: item._extra.pod.spec!.containers.length,
      style: item.name === item._extra.pod.spec!.containers[0].name ? '' : 'display: none',
    }),
  },
  {
    title: 'Container',
    key: 'name',
  },
  {
    title: 'Image',
    key: 'image',
  },
  {
    title: 'Ready',
    key: 'ready',
  },
  {
    title: 'Actions',
    key: 'actions',
    value: () => '',
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

  await listAndUnwaitedWatch(_pods, V1PodFromJSON,
    (opt) => api.listNamespacedPodRaw({ ...opt, namespace: selectedNamespace.value }, { signal: signal.value }),
    (e) => useErrorPresentation().pendingError = e,
  );
});

watch(selectedNamespace, load, { immediate: true });

const closeTab = (index: number) => {
  tab.value = 'table';
  tabs.value.splice(index, 1);
};

const createTab = (type: 'exec' | 'log', target: ContainerData) => {
  const pod = target._extra.pod.metadata!.name!;
  const container = target.name;
  const id = type === 'log' ? `${pod}/${container}` : crypto.randomUUID();
  if (!tabs.value.some((t) => t.id === id)) {
    const isOnlyContainer = target._extra.pod.status!.containerStatuses!.length === 1;
    const name = isOnlyContainer ? truncateStart(pod, 8) : `${truncateStart(pod, 8)}/${container}`;
    const fullName = `${pod}/${container}`;
    tabs.value.push({
      type, id, spec: { pod, container }, alerting: false,
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
      <VDataTable :items="containers" :headers="columns" :loading="loading"
        disable-sort>
        <template #[`header._extra.pod.metadata.name`]>
          Pod
          <KeyValueBadge k="annotation" v="value" class="mr-1" />
          <KeyValueBadge k="label" v="value" pill />
        </template>
        <template #[`item._extra.pod.metadata.name`]="{ item: { _extra: { pod } }, value }">
          {{ value }}
          <br />
          <KeyValueBadge v-for="(value, key) in pod.metadata!.annotations"
            class="mr-1 mb-1"
            :key="key" :k="key as string" :v="value" />
          <br v-if="pod.metadata!.annotations" />
          <KeyValueBadge v-for="(value, key) in pod.metadata!.labels"
            class="mr-1 mb-1"
            :key="key" :k="key as string" :v="value" pill />
        </template>
        <template #[`item.image`]="{ item, value }">
          <LinkedImage :image="value" :id="item.imageID ?? ''" />
        </template>
        <template #[`item.ready`]="{ value }">
          <VIcon v-if="value" icon="mdi-check" />
          <VIcon v-else icon="mdi-close" color="red" />
        </template>
        <template #[`item.actions`]="{ item }">
          <TippedBtn size="small" icon="mdi-console-line" tooltip="Terminal" variant="text"
            :disabled="!item.state?.running || (item._extra.mayExec !== undefined && !item._extra.mayExec)"
            @click="createTab('exec', item)" />
          <TippedBtn size="small" icon="mdi-file-document" tooltip="Log" variant="text"
            :disabled="item._extra.mayReadLogs !== undefined && !item._extra.mayReadLogs"
            @click="createTab('log', item)" />
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
