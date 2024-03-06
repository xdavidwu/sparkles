<script lang="ts" setup>
import {
  VBadge,
  VBtn,
  VDataTable,
  VIcon,
  VTab,
  VWindow,
  VWindowItem
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import ExecTerminal from '@/components/ExecTerminal.vue';
import KeyValueBadge from '@/components/KeyValueBadge.vue';
import LogViewer from '@/components/LogViewer.vue';
import LinkedImage from '@/components/LinkedImage.vue';
import { computed, ref, watch } from 'vue';
import { computedAsync } from '@vueuse/core';
import { useAbortController } from '@/composables/abortController';
import { useAppTabs } from '@/composables/appTabs';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import { useApiConfig } from '@/stores/apiConfig';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { usePermissions } from '@/stores/permissions';
import { CoreV1Api, type V1Pod, V1PodFromJSON, type V1ContainerStatus } from '@/kubernetes-api/src';
import { listAndWatch } from '@/utils/watch';

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
  alerting: boolean,
  bellTimeoutID?: ReturnType<typeof setTimeout>,
}

interface ContainerData extends V1ContainerStatus {
  _extra: {
    pod: V1Pod,
    mayReadLogs?: boolean,
    mayExec?: boolean,
  },
}

const { mayAllows } = usePermissions();

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces();
const { selectedNamespace } = storeToRefs(namespacesStore);

const api = new CoreV1Api(await useApiConfig().getConfig());

const tab = ref('table');
const tabs = ref<Array<Tab>>([]);
const _pods = ref<Array<V1Pod>>([]);
const _containers = computed<Array<ContainerData>>(() =>
  _pods.value.reduce(
    (a, v) => a.concat(v.status!.containerStatuses!.map((c) =>
      ({ ...c, _extra: { pod: v } }))),
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
      rowspan: item._extra.pod.status!.containerStatuses!.length,
      style: item.name === item._extra.pod.status!.containerStatuses![0].name ? '' : 'display: none',
    }),
    sortable: false,
  },
  {
    title: 'Container',
    key: 'name',
    sortable: false,
  },
  {
    title: 'Image',
    key: 'image',
    sortable: false,
  },
  {
    title: 'Ready',
    key: 'ready',
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

const shortenTail = (s: string) =>
  s.length > 8 ? `...${s.substring(s.length - 5)}` : s;

const { abort: abortRequests, signal } = useAbortController();

watch(selectedNamespace, async (namespace) => {
  if (namespace === '') {
    _pods.value = [];
    return;
  }
  abortRequests();

  listAndWatch(_pods, V1PodFromJSON,
    (opt) => api.listNamespacedPodRaw(opt, { signal: signal.value }),
    { namespace })
      .catch((e) => useErrorPresentation().pendingError = e);
}, { immediate: true });

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
    const name = isOnlyContainer ? shortenTail(pod) : `${shortenTail(pod)}/${container}`;
    tabs.value.push({
      type, id, spec: { pod, container }, alerting: false,
      defaultTitle: `${type === 'exec' ? 'Terminal' : 'Log'}: ${name}`,
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
    <VTab v-for="(tab, index) in tabs" :key="tab.id" :value="tab.id"
      @click="() => tab.alerting = false">
      <VBadge dot color="red" v-model="tab.alerting">
        {{ tab.title ?? tab.defaultTitle }}
      </VBadge>
      <VBtn size="x-small" icon="mdi-close" variant="plain" @click.stop="closeTab(index)" />
    </VTab>
  </AppTabs>
  <VWindow v-model="tab" :touch="false">
    <VWindowItem value="table">
      <VDataTable hover :items="containers" :headers="columns">
        <template #[`header._extra.pod.metadata.name`]>
          Pod
          <KeyValueBadge k="annotation" v="value" class="mr-1" />
          <KeyValueBadge k="label" v="value" pill />
        </template>
        <template #[`header.actions`]>Actions</template>
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
          <LinkedImage :image="value" :title="item.imageID" />
        </template>
        <template #[`item.ready`]="{ value }">
          <VIcon v-if="value" icon="mdi-check" />
          <VIcon v-else icon="mdi-close" color="red" />
        </template>
        <template #[`item.actions`]="{ item }">
          <VBtn size="small" icon="mdi-console-line" title="Terminal" variant="text"
            :disabled="!item.state!.running || (item._extra.mayExec !== undefined && !item._extra.mayExec)"
            @click="createTab('exec', item)" />
          <VBtn size="small" icon="mdi-file-document" title="Log" variant="text"
            :disabled="item._extra.mayReadLogs !== undefined && !item._extra.mayReadLogs"
            @click="createTab('log', item)" />
        </template>
        <template #bottom />
      </VDataTable>
    </VWindowItem>
    <VWindowItem v-for="(tab, index) in tabs" :key="tab.id"
      :value="tab.id">
      <component :is="tab.type === 'exec' ? ExecTerminal : LogViewer"
        :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`"
        @title-changed="(title) => tab.title = title"
        @bell="() => bell(index)"
        :container-spec="{ namespace: selectedNamespace, ...tab.spec}" />
    </VWindowItem>
  </VWindow>
</template>
