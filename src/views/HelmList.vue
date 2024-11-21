<script lang="ts" setup>
import { VBtn, VCard, VDataTable, VDialog } from 'vuetify/components';
import FixedFab from '@/components/FixedFab.vue';
import HelmCreate from '@/components/HelmCreate.vue';
import HelmListRow from '@/components/HelmListRow.vue';
import HelmUpgrade from '@/components/HelmUpgrade.vue';
import HelmValues from '@/components/HelmValues.vue';
import LinkedDocument from '@/components/LinkedDocument.vue';
import LoadingSuspense from '@/components/LoadingSuspense.vue';
import { computed, ref, watch, toRaw } from 'vue';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useHelmRepository } from '@/stores/helmRepository';
import { useNamespaces } from '@/stores/namespaces';
import { useApiLoader } from '@/composables/apiLoader';
import { stringify } from '@/utils/yaml';
import { CoreV1Api, type V1Secret, V1SecretFromJSON } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { listAndUnwaitedWatch } from '@/utils/watch';
import { notifyListingWatchErrors } from '@/utils/errors';
import { withProgress } from '@/utils/progressReport';
import {
  type Chart, type Metadata, type Release,
  parseSecret, secretsFieldSelector, secretsLabelSelector, secretName,
} from '@/utils/helm';
import type { InboundMessage } from '@/utils/helm.webworker';
import {
  handleDataRequestMessages,
  handleErrorMessages,
  handleToastMessages,
  handleProgressMessages,
} from '@/utils/communication';
import HelmWorker from '@/utils/helm.webworker?worker';

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces;
const { selectedNamespace } = storeToRefs(namespacesStore);

const config = await useApiConfig().getConfig();
const api = new CoreV1Api(config);

type ParsedSecret = V1Secret & Release;
const releaseTransformer = async (o: object): Promise<ParsedSecret> => {
  const secret = V1SecretFromJSON(o);
  return {
    ...secret,
    // TODO handle failures?
    ...await parseSecret(secret),
  };
};
const _releases = ref<Array<ParsedSecret>>([]);
const releases = computed(() => _releases.value.toSorted((a, b) => {
  if (a.name !== b.name) {
    return a.name.localeCompare(b.name);
  }
  return b.version - a.version;
}));

const creating = ref(false);
const upgrading = ref(false);
const inspecting = ref(false);

const inspectedRelease = ref<Release | undefined>();
const upgradeIntent = ref<'values' | 'upgrade'>('values');
const upgradingRelease = ref<Release | undefined>();

// load failure affects only update check, not fatal,
// letting HelmCreate notify user should be enough
const { charts } = storeToRefs(useHelmRepository());

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

const { loading, load } = useApiLoader((signal) => listAndUnwaitedWatch(
  _releases, releaseTransformer,
  (opt) => api.listNamespacedSecretRaw(
    {
      ...opt,
      namespace: selectedNamespace.value,
      fieldSelector: secretsFieldSelector,
      labelSelector: secretsLabelSelector,
    },
    { signal },
  ),
  notifyListingWatchErrors,
));

watch(selectedNamespace, load, { immediate: true });

// we don't really know where chart of a release is from,
// but with home and sources should make us confident enough?
const isSameChart = (a: Metadata, b: Metadata) =>
  a.name == b.name && a.home == b.home && a.sources?.sort().join('') == b.sources?.sort().join('');

const latestChart = (release: Release) =>
  charts.value.find((c) => isSameChart(c, release.chart.metadata));

let worker: Worker | undefined;

const workerOp = (progress: (p: string) => unknown, msg: InboundMessage,
    transfer?: Transferable[]): Promise<string | undefined> => {
  if (!worker) {
    worker = new HelmWorker();
  }
  return new Promise((resolve, reject) => {
    const handlers = [
      handleDataRequestMessages(worker!),
      handleErrorMessages(reject),
      handleToastMessages,
      handleProgressMessages(progress, resolve),
    ];
    worker!.onmessage = async (e) => {
      for (const handler of handlers) {
        if (await handler(e)) {
          return;
        }
      }
    };
    if (transfer) {
      worker!.postMessage(msg, transfer);
    } else {
      worker!.postMessage(msg);
    }
  });
};

const view = (target: Release) => {
  inspectedRelease.value = target;
  inspecting.value = true;
};

const uninstall = (target: Release) => withProgress(
  `Uninstalling release ${target.name}`,
  (progress) => workerOp(progress, {
    type: 'call',
    func: 'uninstall',
    args: [toRaw(target)],
  }),
);

const rollback = (target: Release) => withProgress(
  `Rolling back release ${target.name} to ${target.version}`,
  (progress) => workerOp(progress, {
    type: 'call',
    func: 'rollback',
    args: [toRaw(target), toRaw(releases.value.filter((r) => r.name == target.name))],
  }),
);


const findBuffers = (o: unknown): Array<ArrayBuffer> => {
  if (o instanceof ArrayBuffer) {
    return [o];
  } else if (Array.isArray(o)) {
    return o.flatMap((v) => findBuffers(v));
  } else if (typeof o == 'object' && o != null) {
    return findBuffers(Object.values(o));
  }
  return [];
}

const install = (chart: Array<Chart>, values: object, name: string) =>
  withProgress(`Installing release ${name}`, async (progress) => {
    const secret = await workerOp(progress, {
      type: 'call',
      func: 'install',
      args: [
        toRaw(chart), toRaw(values), toRaw(name),
        toRaw(selectedNamespace.value),
      ],
    }, findBuffers(chart));
    creating.value = false;

    // may race with watch, but extremely unlikely
    // since it is at least persisted once early before resources creation
    const r = releases.value.find((r) => secretName(r) == secret);
    if (r) {
      view(r);
    }
  });

const purge = (name: string) => Promise.all(
  releases.value.filter((r) => r.name == name).map(
    (r) => api.deleteNamespacedSecret({
      namespace: selectedNamespace.value,
      name: secretName(r),
    }),
  ),
);

const prepareUpgrade = async (intent: 'values' | 'upgrade', target: Release) => {
  upgradeIntent.value = intent;
  upgradingRelease.value = target;
  upgrading.value = true;
};

const upgrade = (chart: Array<Chart>, values: object, target: Release) =>
  withProgress(
    `Upgrade release ${target.name} to chart ${chart[0].metadata.version}`,
    async (progress) => {
      const secret = await workerOp(progress, {
        type: 'call',
        func: 'upgrade',
        args: [toRaw(chart), toRaw(values), toRaw(target),
          toRaw(releases.value.filter((r) => r.name == target.name))],
      });
      upgrading.value = false;

      // may race with watch, but extremely unlikely
      // since it is at least persisted once early before resources creation
      const r = releases.value.find((r) => secretName(r) == secret);
      if (r) {
        view(r);
      }
    },
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
        @purge="purge((groupProps.item.items[0].raw as Release).name)"
        @upgrade="(t) => prepareUpgrade(t, groupProps.item.items[0].raw as Release)"/>
    </template>
    <template #item="{ props }">
      <!-- XXX: VDataTableRows internally use this .props, but type is lost -->
      <HelmListRow v-bind="props as any" history
        @view="view(props.item.raw as Release)"
        @rollback="rollback(props.item.raw as Release)" />
    </template>
  </VDataTable>
  <FixedFab icon="$plus" @click="creating = true" />
  <VDialog v-model="creating">
    <HelmCreate :used-names="names" @apply="install" @cancel="creating = false" />
  </VDialog>
  <VDialog v-model="inspecting">
    <VCard v-if="inspectedRelease"
      :title="`Details for release ${inspectedRelease.name}, revision ${inspectedRelease.version}`">
      <template #text>
        <div class="mb-n6">
          <HelmValues height="calc(100dvh - 48px - 116px)"
            :model-value="stringify(inspectedRelease.config ?? {})"
            :chart="inspectedRelease.chart"
            :prepend-tabs="[{ text: 'Notes', value: 'notes' }]" disabled>
            <template #notes="{ style }">
              <LinkedDocument :style="style"
                class="pa-2 overflow-y-auto bg-black text-mono"
                :text="inspectedRelease.info.notes ?? '(none)'" />
            </template>
          </HelmValues>
        </div>
      </template>
      <template #actions>
        <VBtn color="primary" @click="inspecting = false">Close</VBtn>
      </template>
    </VCard>
  </VDialog>
  <VDialog v-model="upgrading">
    <LoadingSuspense v-if="upgradingRelease" :key="upgradingRelease.name"
      class="v-card--variant-elevated" style="min-height: calc(100dvh - 48px)">
      <HelmUpgrade :from="upgradingRelease" :to="latestChart(upgradingRelease)!"
        :title="`${upgradeIntent == 'values' ? 'Editing' : 'Upgrading'} release ${upgradingRelease.name}`"
        @cancel="upgrading = false" @upgrade="upgrade" />
    </LoadingSuspense>
  </VDialog>
</template>
