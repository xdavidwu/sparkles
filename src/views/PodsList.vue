<script lang="ts" setup>
import {
  VBadge,
  VBtn,
  VDataTable,
  VIcon,
  VTab,
  VTabs,
  VWindow,
  VWindowItem
} from 'vuetify/components';
import ExecTerminal from '@/components/ExecTerminal.vue';
import KeyValueBadge from '@/components/KeyValueBadge.vue';
import LogViewer from '@/components/LogViewer.vue';
import LinkedImage from '@/components/LinkedImage.vue';
import { computed, ref, watch } from 'vue';
import { computedAsync } from '@vueuse/core';
import { useAbortController } from '@/composables/abortController';
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

interface ContainerData extends V1ContainerStatus {
  _extra: {
    pod: V1Pod,
    mayReadLogs?: boolean,
    mayExec?: boolean,
  },
}

const { mayAllows } = usePermissions();

const { selectedNamespace } = storeToRefs(useNamespaces());

const tab = ref('table');
const tabs = ref<Array<ExecTab | LogTab>>([]);
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

const { abort: abortRequests, signal } = useAbortController();

watch(selectedNamespace, async (namespace) => {
  if (!namespace || namespace.length === 0) {
    _pods.value = [];
    return;
  }
  abortRequests();

  const api = new CoreV1Api(await useApiConfig().getConfig());
  listAndWatch(_pods, V1PodFromJSON,
    (opt) => api.listNamespacedPodRaw(opt, { signal: signal.value }),
    { namespace })
      .catch((e) => useErrorPresentation().pendingError = e);
}, { immediate: true });

const closeTab = (index: number) => {
  tab.value = 'table';
  tabs.value.splice(index, 1);
};

const createTab = (type: 'exec' | 'log', pod: string, container: string) => {
  const id = `${type}-${pod}/${container}`;
  if (!tabs.value.some((t) => t.id === id)) {
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
      <VDataTable hover :items="containers" :headers="columns">
        <template #[`header.pod`]>
          Pod
          <KeyValueBadge k="annotation" v="value" />
          <KeyValueBadge k="label" v="value" pill />
        </template>
        <template #[`header.actions`]>Actions</template>
        <template #[`item._extra.pod.metadata.name`]="{ item: { _extra: { pod } }, value }">
          {{ value }}
          <br />
          <KeyValueBadge v-for="(value, key) in pod.metadata!.annotations"
            :key="key" :k="key as string" :v="value" />
          <br v-if="pod.metadata!.annotations" />
          <KeyValueBadge v-for="(value, key) in pod.metadata!.labels"
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
            @click="createTab('exec', item._extra.pod.metadata!.name!, item.name)" />
          <VBtn size="small" icon="mdi-file-document" title="Log" variant="text"
            :disabled="item._extra.mayReadLogs !== undefined && !item._extra.mayReadLogs"
            @click="createTab('log', item._extra.pod.metadata!.name!, item.name)" />
        </template>
        <template #bottom />
      </VDataTable>
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
