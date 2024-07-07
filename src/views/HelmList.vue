<script lang="ts" setup>
import {
  VBtn,
  VCard,
  VDataTable,
  VDialog,
  VTab,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import FixedFab from '@/components/FixedFab.vue';
import HelmCreate from '@/components/HelmCreate.vue';
import HelmListRow from '@/components/HelmListRow.vue';
import ProgressDialog from '@/components/ProgressDialog.vue';
import TabsWindow from '@/components/TabsWindow.vue';
import WindowItem from '@/components/WindowItem.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import { computed, ref, watch, toRaw } from 'vue';
import { computedAsync } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useHelmRepository } from '@/stores/helmRepository';
import { useNamespaces } from '@/stores/namespaces';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useAbortController } from '@/composables/abortController';
import { useAppTabs } from '@/composables/appTabs';
import { useLoading } from '@/composables/loading';
import { stringify } from '@/utils/yaml';
import { CoreV1Api, type V1Secret, V1SecretFromJSON } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { listAndUnwaitedWatch } from '@/utils/watch'
import {
  type Chart, type Metadata, type Release,
  parseSecret, secretsLabelSelector, secretName,
} from '@/utils/helm';
import type { InboundMessage } from '@/utils/helm.webworker';
import {
  handleDataRequestMessages,
  handleErrorMessages,
  handleProgressMessages,
} from '@/utils/communication';
import HelmWorker from '@/utils/helm.webworker?worker';

// TODO drop tabs?
interface ValuesTab {
  id: string,
  values: object,
}

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces;
const { selectedNamespace } = storeToRefs(namespacesStore);

const config = await useApiConfig().getConfig();
const api = new CoreV1Api(config);

const secrets = ref<Array<V1Secret>>([]);
const tab = ref('table');
const tabs = ref<Array<ValuesTab>>([]);

const creating = ref(false);

const operation = ref('');
const progressMessage = ref('');
const progressCompleted = ref(true);
const notes = ref<string | undefined>();
const showNotes = ref(false);

const { charts } = storeToRefs(useHelmRepository());
await useHelmRepository().ensureIndex; // TODO maybe not

const releases = computedAsync(async () =>
  // avoid multiple layer of proxy via toRaw, for easier cloning
  (await Promise.all(secrets.value.map((s) => parseSecret(toRaw(s))))).sort((a, b) => {
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    return b.version - a.version;
  }), []);

const names = computed(() => Array.from(releases.value.map((r) => r.name)
  .reduce((a, v) => a.set(v, true), new Map<string, boolean>()).keys()));

const columns = [
  {
    title: 'Release',
    key: 'data-table-group',
    value: (r: Release) => r.name,
    cellProps: {
      class: 'ps-1',
    },
  },
  {
    title: 'Revision',
    key: 'version',
  },
  {
    title: 'Chart',
    key: 'chart.metadata.name',
  },
  {
    title: 'Version',
    key: 'chart.metadata.version',
  },
  {
    title: 'App version',
    key: 'chart.metadata.appVersion',
  },
  {
    title: 'Status',
    key: 'info.status',
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

const { appBarHeightPX } = useAppTabs();

const { abort: abortRequests, signal } = useAbortController();

const createTab = (release: Release) => {
  const id = `${release.name}@${release.version}`;
  if (!tabs.value.some((t) => t.id === id)) {
    tabs.value.push({
      id,
      values: release.config ?? {},
    });
  }
  tab.value = id;
};

const closeTab = (idx: number) => {
  tab.value = 'table';
  tabs.value.splice(idx, 1);
};

const { loading, load } = useLoading(async () => {
  abortRequests();
  await listAndUnwaitedWatch(secrets, V1SecretFromJSON,
    (opt) => api.listNamespacedSecretRaw(
      { ...opt, namespace: selectedNamespace.value, labelSelector: secretsLabelSelector },
      { signal: signal.value },
    ),
    (e) => useErrorPresentation().pendingError = e,
  );
});

watch(selectedNamespace, load, { immediate: true });

// TODO be safer
const isSameChart = (a: Metadata, b: Metadata) => a.name == b.name;

const latestChart = (release: Release) =>
  charts.value.find((c) => isSameChart(c, release.chart.metadata));

let worker: Worker | undefined;

const prepareWorker = () => {
  if (!worker) {
    worker = new HelmWorker();
  }
  const handlers = [
    handleDataRequestMessages(worker),
    handleErrorMessages,
    handleProgressMessages(progressMessage, progressCompleted, notes),
  ];
  worker.onmessage = async (e) => {
    for (const handler of handlers) {
      if (await handler(e)) {
        return;
      }
    }
  };
  return worker;
};

watch(progressCompleted, () => {
  if (progressCompleted.value && notes.value?.length) {
    showNotes.value = true;
  }
});

const uninstall = (target: Release) => {
  const worker = prepareWorker();
  operation.value = `Uninstalling release ${target.name}`;
  progressMessage.value = 'Uninstalling release';
  progressCompleted.value = false;
  const op: InboundMessage = {
    type: 'call',
    func: 'uninstall',
    args: [toRaw(target)],
  };
  worker.postMessage(op);
};

const rollback = (target: Release) => {
  const worker = prepareWorker();
  operation.value = `Rolling back release ${target.name} to ${target.version}`;
  progressMessage.value = 'Rolling back release';
  progressCompleted.value = false;
  const op: InboundMessage = {
    type: 'call',
    func: 'rollback',
    args: [toRaw(target), toRaw(releases.value.filter((r) => r.name == target.name))],
  };
  worker.postMessage(op);
};

const findBuffers = (o: unknown): Array<ArrayBuffer> => {
  if (o instanceof ArrayBuffer) {
    return [o];
  } else if (Array.isArray(o)) {
    return o.reduce((a, v) => a.concat(findBuffers(v)), []);
  } else if (typeof o == 'object' && o != null) {
    return findBuffers(Object.values(o));
  }
  return [];
}

const install = (chart: Array<Chart>, values: object, name: string) => {
  const worker = prepareWorker();
  operation.value = `Installing release ${name}`;
  progressMessage.value = 'Installing release';
  progressCompleted.value = false;
  const op: InboundMessage = {
    type: 'call',
    func: 'install',
    args: [toRaw(chart), toRaw(values), toRaw(name), toRaw(selectedNamespace.value)],
  };
  worker.postMessage(op, findBuffers(chart));
  creating.value = false;
};

const purge = (name: string) => Promise.all(
  releases.value.filter((r) => r.name == name).map(
    (r) => api.deleteNamespacedSecret({
      namespace: selectedNamespace.value,
      name: secretName(r),
    }),
  ),
);
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="table">Releases</VTab>
    <DynamicTab v-for="(tab, index) in tabs" :key="tab.id" :value="tab.id"
      :title="`Values: ${ tab.id }`" @close="() => closeTab(index)" />
  </AppTabs>
  <TabsWindow v-model="tab">
    <WindowItem value="table">
      <VDataTable :items="releases" :headers="columns" :loading="loading"
        :row-props="{ class: 'darken' }" :group-by="[{ key: 'name', order: 'asc' }]"
        disable-sort>
        <template #group-header='groupProps'>
          <HelmListRow v-bind="groupProps"
            :latest-chart="latestChart(groupProps.item.items[0].raw as Release)"
            :item="groupProps.item.items[0]"
            :expandable="groupProps.item.items.length > 1"
            :expanded="groupProps.isGroupOpen(groupProps.item)"
            @toggle-expand="groupProps.toggleGroup(groupProps.item)"
            @view="createTab(groupProps.item.items[0].raw as Release)"
            @uninstall="uninstall(groupProps.item.items[0].raw as Release)"
            @rollback="rollback(groupProps.item.items[0].raw as Release)"
            @purge="purge((groupProps.item.items[0].raw as Release).name)" />
        </template>
        <template #item="{ props }">
          <!-- XXX: VDataTableRows internally use this .props, but type is lost -->
          <HelmListRow v-bind="props as any" history
            @view="createTab(props.item.raw as Release)"
            @rollback="rollback(props.item.raw as Release)" />
        </template>
      </VDataTable>
      <FixedFab icon="$plus" @click="() => creating = true" />
    </WindowItem>
    <WindowItem v-for="tab in tabs" :key="tab.id" :value="tab.id">
      <YAMLEditor :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`"
        :model-value="stringify(tab.values)" disabled />
    </WindowItem>
  </TabsWindow>
  <VDialog v-model="creating">
    <HelmCreate :used-names="names" @apply="install" @cancel="creating = false" />
  </VDialog>
  <ProgressDialog :model-value="!progressCompleted" :title="operation" :text="progressMessage" />
  <VDialog v-model="showNotes">
    <VCard title="Notes from release">
      <template #text>
        <pre class="text-pre-wrap">{{ notes }}</pre>
      </template>
      <template #actions>
        <VBtn color="primary" @click="showNotes = false">Close</VBtn>
      </template>
    </VCard>
  </VDialog>
</template>
