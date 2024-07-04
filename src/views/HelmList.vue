<script lang="ts" setup>
import {
  VBtn,
  VDataTable,
  VDataTableRow,
  VDialog,
  VTab,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import FixedFab from '@/components/FixedFab.vue';
import HelmCreate from '@/components/HelmCreate.vue';
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import ProgressDialog from '@/components/ProgressDialog.vue';
import TabsWindow from '@/components/TabsWindow.vue';
import TippedBtn from '@/components/TippedBtn.vue';
import WindowItem from '@/components/WindowItem.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import { computed, ref, watch, toRaw } from 'vue';
import { computedAsync } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useNamespaces } from '@/stores/namespaces';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useAbortController } from '@/composables/abortController';
import { useAppTabs } from '@/composables/appTabs';
import { useLoading } from '@/composables/loading';
import { stringify } from '@/utils/yaml';
import { CoreV1Api, type V1Secret, V1SecretFromJSON } from '@/kubernetes-api/src';
import { listAndUnwaitedWatch } from '@/utils/watch'
import {
  type Chart, type Release,
  parseSecret, secretsLabelSelector, Status,
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
const progress = ref('');
const progressCompleted = ref(true);

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

// DataTableItem<T> is not exported
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const latestRevision = (releases: ReadonlyArray<any>) => releases.reduce(
  (a, v) => (v.raw.version > a.raw.version) ? v : a, releases[0]);

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

let worker: Worker | undefined;

const prepareWorker = () => {
  if (!worker) {
    worker = new HelmWorker();
  }
  const handlers = [
    handleDataRequestMessages(worker),
    handleErrorMessages,
    handleProgressMessages(progress, progressCompleted),
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

const uninstall = (target: Release) => {
  const worker = prepareWorker();
  operation.value = `Uninstalling release ${target.name}`;
  progress.value = 'Uninstalling release';
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
  progress.value = 'Rolling back release';
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
  progress.value = 'Installing release';
  progressCompleted.value = false;
  const op: InboundMessage = {
    type: 'call',
    func: 'install',
    args: [toRaw(chart), toRaw(values), toRaw(name), toRaw(selectedNamespace.value)],
  };
  worker.postMessage(op, findBuffers(chart));
  creating.value = false;
};
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
        :row-props="{class: 'darken'}" :group-by="[{ key: 'name', order: 'asc'}]"
        disable-sort>
        <template #group-header='groupProps'>
          <VDataTableRow v-bind="groupProps" :item="latestRevision(groupProps.item.items)" class="group-header">
            <template #[`item.data-table-group`]='{ value }'>
              <VBtn size="small" variant="text"
                :icon="groupProps.isGroupOpen(groupProps.item) ? '$expand' : '$next'"
                :disabled="groupProps.item.items.length == 1"
                @click="groupProps.toggleGroup(groupProps.item)" />
              {{ value }}
            </template>
            <template #[`item.version`]='{ item, value }'>
              <span class="pe-2">
                {{ value }}
                <LinkedTooltip :text="`Last deployed: ${new Date((item as Release).info.last_deployed!)}`" activator="parent" />
              </span>
            </template>
            <template #[`item.chart.metadata.name`]='{ item, value }'>
              <div class="d-flex align-center">
                <img :src="(item as Release).chart.metadata.icon" class="chart-icon mr-2" />
                {{ value }}
                <LinkedTooltip
                  v-if="(item as Release).chart.metadata.description"
                  :text="(item as Release).chart.metadata.description!"
                  activator="parent" />
              </div>
            </template>
            <template #[`item.actions`]='{ item }'>
              <TippedBtn size="small" icon="mdi-file-document" tooltip="Values" variant="text"
                @click="() => createTab(item as Release)" />
              <TippedBtn v-if="(item as Release).info.status == Status.DEPLOYED"
                size="small" icon="mdi-delete" tooltip="Uninstall" variant="text"
                @click="() => uninstall(item as Release)" />
              <TippedBtn v-if="(item as Release).info.status == Status.UNINSTALLED"
                size="small" icon="mdi-reload" tooltip="Restore" variant="text"
                @click="() => rollback(item as Release)" />
            </template>
          </VDataTableRow>
        </template>
        <template #[`item.data-table-group`]>
          <VBtn size="small" variant="text" disabled icon="mdi-circle-small" />
        </template>
        <template #[`item.version`]='{ item, value }'>
          <span class="pe-2">
            {{ value }}
            <LinkedTooltip :text="`Last deployed: ${new Date(item.info.last_deployed!)}`" activator="parent" />
          </span>
        </template>
        <template #[`item.chart.metadata.name`]='{ item, value }'>
          <div class="d-flex align-center">
            <img :src="item.chart.metadata.icon" class="chart-icon mr-2" />
            {{ value }}
            <LinkedTooltip v-if="item.chart.metadata.description"
              :text="item.chart.metadata.description" activator="parent" />
          </div>
        </template>
        <template #[`item.actions`]='{ item }'>
          <TippedBtn size="small" icon="mdi-file-document" tooltip="Values" variant="text"
            @click="() => createTab(item)" />
          <TippedBtn v-if="item.info.status == Status.SUPERSEDED" size="small"
            icon="mdi-reload" tooltip="Rollback" variant="text" @click="() => rollback(item)" />
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
  <ProgressDialog :model-value="!progressCompleted" :title="operation" :text="progress" />
</template>

<style scoped>
.chart-icon {
  max-height: 2em;
  max-width: 2em;
}

:deep(.darken) {
  background-color: rgba(var(--v-theme-background), var(--v-medium-emphasis-opacity));
}

/* newest in history, same as group header */
:deep(.group-header + .darken) {
  display: none;
}
</style>
