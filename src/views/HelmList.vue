<script lang="ts" setup>
import {
  VBtn,
  VCard,
  VDataTable,
  VDialog,
  VTabs,
} from 'vuetify/components';
import FixedFab from '@/components/FixedFab.vue';
import HelmCreate from '@/components/HelmCreate.vue';
import HelmListRow from '@/components/HelmListRow.vue';
import LinkedDocument from '@/components/LinkedDocument.vue';
import ProgressDialog from '@/components/ProgressDialog.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import { computed, ref, watch, toRaw } from 'vue';
import { computedAsync } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useHelmRepository } from '@/stores/helmRepository';
import { useNamespaces } from '@/stores/namespaces';
import { useAbortController } from '@/composables/abortController';
import { useLoading } from '@/composables/loading';
import { stringify } from '@/utils/yaml';
import { CoreV1Api, type V1Secret, V1SecretFromJSON } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { listAndUnwaitedWatch } from '@/utils/watch';
import { notifyListingWatchErrors } from '@/utils/errors';
import {
  type Chart, type Metadata, type Release,
  parseSecret, secretsFieldSelector, secretsLabelSelector, secretName,
} from '@/utils/helm';
import type { InboundMessage } from '@/utils/helm.webworker';
import {
  handleDataRequestMessages,
  handleErrorMessages,
  handleProgressMessages,
} from '@/utils/communication';
import HelmWorker from '@/utils/helm.webworker?worker';

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces;
const { selectedNamespace } = storeToRefs(namespacesStore);

const config = await useApiConfig().getConfig();
const api = new CoreV1Api(config);

const secrets = ref<Array<V1Secret>>([]);

const creating = ref(false);

const operation = ref('');
const progressMessage = ref('');
const progressCompleted = ref(true);
const installedSecret = ref<string | undefined>();
const inspectedRelease = ref<Release | undefined>();
const inspect = ref(false);

const { charts } = storeToRefs(useHelmRepository());
try {
  await useHelmRepository().ensureIndex;
} catch (e) {
  // affects only update check, not fatal,
  // letting HelmCreate notify user should be enough
}

const releases = computedAsync(async () =>
  (await Promise.all(secrets.value.map(async (s) => {
    try {
      // avoid multiple layer of proxy via toRaw, for easier cloning
      return await parseSecret(toRaw(s));
    } catch (e) {
      console.log(e);
      useErrorPresentation().pendingToast = `Failed to parse Helm release from secret ${s.metadata!.namespace}/${s.metadata!.name}`;
    }
  }))).filter((v) => v != undefined).sort((a, b) => {
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

const inspectTabs = [
  { text: 'Notes', value: 'notes' },
  { text: 'Values', value: 'values' },
  { text: 'Default values', value: 'defaults' },
];

const { abort: abortRequests, signal } = useAbortController();

const { loading, load } = useLoading(async () => {
  abortRequests();
  await listAndUnwaitedWatch(secrets, V1SecretFromJSON,
    (opt) => api.listNamespacedSecretRaw(
      {
        ...opt,
        namespace: selectedNamespace.value,
        fieldSelector: secretsFieldSelector,
        labelSelector: secretsLabelSelector,
      },
      { signal: signal.value },
    ),
    notifyListingWatchErrors,
  );
});

watch(selectedNamespace, load, { immediate: true });

// we don't really know where chart of a release is from,
// but with home and sources should make us confident enough?
const isSameChart = (a: Metadata, b: Metadata) =>
  a.name == b.name && a.home == b.home && a.sources?.sort().join('') == b.sources?.sort().join('');

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
    handleProgressMessages(progressMessage, progressCompleted, installedSecret),
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
  if (progressCompleted.value && installedSecret.value?.length) {
    // may race with watch, but extremely unlikely
    // since it is at least persisted once early before resources creation
    const r = releases.value.find((r) => secretName(r) == installedSecret.value);
    if (r) {
      view(r);
    }
  }
});

const view = (target: Release) => {
  inspectedRelease.value = target;
  inspect.value = true;
};

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
        @view="view(groupProps.item.items[0].raw as Release)"
        @uninstall="uninstall(groupProps.item.items[0].raw as Release)"
        @rollback="rollback(groupProps.item.items[0].raw as Release)"
        @purge="purge((groupProps.item.items[0].raw as Release).name)" />
    </template>
    <template #item="{ props }">
      <!-- XXX: VDataTableRows internally use this .props, but type is lost -->
      <HelmListRow v-bind="props as any" history
        @view="view(props.item.raw as Release)"
        @rollback="rollback(props.item.raw as Release)" />
    </template>
  </VDataTable>
  <FixedFab icon="$plus" @click="() => creating = true" />
  <VDialog v-model="creating">
    <HelmCreate :used-names="names" @apply="install" @cancel="creating = false" />
  </VDialog>
  <ProgressDialog :model-value="!progressCompleted" :title="operation" :text="progressMessage" />
  <VDialog v-model="inspect">
    <VCard v-if="inspectedRelease"
      :title="`Details for release ${inspectedRelease.name}, revision ${inspectedRelease.version}`">
      <template #text>
        <div class="mb-n6">
        <VTabs :items="inspectTabs">
          <template #[`item.notes`]>
            <LinkedDocument :style="`height: calc(100dvh - 48px - 140px - 48px)`"
              class="text-pre-wrap pt-2 overflow-y-auto bg-black"
              :text="inspectedRelease.info.notes ?? '(none)'" />
          </template>
          <template #[`item.values`]>
            <YAMLEditor :style="`height: calc(100dvh - 48px - 140px - 48px)`"
              :model-value="stringify(inspectedRelease.config ?? {})" disabled />
          </template>
          <template #[`item.defaults`]>
            <YAMLEditor :style="`height: calc(100dvh - 48px - 140px - 48px)`"
              :model-value="stringify(inspectedRelease.chart.values)" disabled />
          </template>
        </VTabs>
        </div>
      </template>
      <template #actions>
        <VBtn color="primary" @click="inspect = false">Close</VBtn>
      </template>
    </VCard>
  </VDialog>
</template>
