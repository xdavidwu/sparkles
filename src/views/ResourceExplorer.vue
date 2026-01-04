<script setup lang="ts">
import {
  VAutocomplete,
  VBtn,
  VCheckboxBtn,
  VCol,
  VDataTableVirtual,
  VIcon,
  VRow,
  VTab,
  VTextField,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import FixedFab from '@/components/FixedFab.vue';
import HumanDurationSince from '@/components/HumanDurationSince.vue';
import LinkedImage from '@/components/LinkedImage.vue';
import HoverTooltip from '@/components/HoverTooltip.vue';
import SpeedDialBtn from '@/components/SpeedDialBtn.vue';
import SpeedDialFab from '@/components/SpeedDialFab.vue';
import TabsWindow from '@/components/TabsWindow.vue';
import WindowItem from '@/components/WindowItem.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import { vResizeObserver } from '@vueuse/components';
import { computed, watch, ref, nextTick, triggerRef, useTemplateRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useDisplay } from 'vuetify';
import { timestamp, useLastChanged, useEventListener } from '@vueuse/core';
import { useApiLoader } from '@/composables/apiLoader';
import { useAppTabs } from '@/composables/appTabs';
import { useNamespaces } from '@/stores/namespaces';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useApiConfig } from '@/stores/apiConfig';
import { useOpenAPISchemaDiscovery } from '@/stores/openAPISchemaDiscovery';
import { usePermissions } from '@/stores/permissions';
import type { CoreV1Event, EventsV1Event, V1ObjectMeta } from '@xdavidwu/kubernetes-client-typescript-fetch';
import {
  AnyApi,
  type V1Table, type V1PartialObjectMetadata, type V1TableColumnDefinition, type V1TableRow,
} from '@/utils/AnyApi';
import {
  asYAML, byYAML, chainOverrideFunction,
  setTableIncludeObjectPolicy, V1IncludeObjectPolicy,
  V1DeletePropagation,
} from '@/utils/api';
import { V2ResourceScope, type V2APIResourceDiscovery } from '@/utils/discoveryV2';
import { uniqueKeyForObject, type KubernetesObject } from '@/utils/objects';
import { listAndUnwaitedWatchTable } from '@/utils/watch';
import { truncate } from '@/utils/text';
import { durationToS } from '@/utils/duration';
import { nonNullableRef } from '@/utils/reactivity';
import { notifyListingWatchErrors } from '@/utils/errors';
import type { JSONSchema4 } from 'json-schema';
import { templates } from '@/utils/templates';
import { parseInput, stringify } from '@/utils/yaml';
import { parse } from 'yaml';
import { real } from '@ragnarpa/quantity';
import { createNameId } from 'mnemonic-id';

interface ObjectRecord {
  schema?: JSONSchema4,
  object: string,
  metadata: V1ObjectMeta,
  api: {
    group?: string,
    version: string,
    plural: string,
  },
  kind: V2APIResourceDiscovery,
  editing: boolean,
  unsaved: boolean,
  selection?: { anchor: number, head: number },
}

const NAME_NEW = '(new)'; // must be invalid
enum TimestampColumns {
  CREATION_TIMESTAMP = 'creationTimestamp',
  LAST_SEEN = 'lastSeen',
  FIRST_SEEN = 'firstSeen',
}
enum ImageColumns {
  IMAGES = 'images',
}

const apiConfigStore = useApiConfig();
const openAPISchemaDiscovery = useOpenAPISchemaDiscovery();
const anyApi = new AnyApi(await apiConfigStore.getConfig());

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces;
const { selectedNamespace } = storeToRefs(namespacesStore);
const permissionsStore = usePermissions();

const allNamespaces = ref(false);
const rawGroups = await useApisDiscovery().getGroups();

const loadedNamespace = ref(selectedNamespace.value);
const loadPermissions = async () => {
  await permissionsStore.loadReview(selectedNamespace.value);
  loadedNamespace.value = selectedNamespace.value;
};
await loadPermissions();
const groupVersions = computed(() => rawGroups.map((g) => {
  const knownResources: Array<string> = [];
  return g.versions.map((v) => {
    const resources = v.resources.filter((r) =>
      !knownResources.includes(r.resource) && r.verbs.includes('list'));
    knownResources.push(...resources.map((r) => r.resource));

    return {
      ...v,
      resources: resources.map((r) => ({
        r,
        enabled: permissionsStore.mayAllows(loadedNamespace.value, g.metadata?.name ?? '', r.resource, '*', 'list'),
      })).filter((r) => r.enabled).map((r) => r.r),
      group: g.metadata?.name,
      groupVersion: g.metadata?.name ? `${g.metadata.name}/${v.version}` : v.version,
    };
  }).filter((v) => v.resources.length);
}).flat());
// TODO handle targetGroupVersion nolonger in groupVersions
const targetGroupVersion = nonNullableRef(groupVersions.value[0]!);

const kinds = computed(() => targetGroupVersion.value.resources);
const defaultTargetKind = () =>
  kinds.value.find((v) => v.verbs.includes('watch')) ?? kinds.value[0]!;
const targetKind = nonNullableRef(defaultTargetKind());
const isEvents = computed(() => targetKind.value.resource === 'events' &&
  (targetGroupVersion.value.groupVersion === 'v1' ||
  targetGroupVersion.value.groupVersion === 'events.k8s.io/v1'));

const objects = ref<V1Table<V1PartialObjectMetadata>>({
  columnDefinitions: [],
  rows: [],
});
const lastUpdatedAt = useLastChanged(objects, { initialValue: timestamp() });
const tab = ref('explore');
const inspectedObjects = ref<Map<string, ObjectRecord>>(new Map());
const { smAndDown, xlAndUp } = useDisplay();
const verbose = ref(xlAndUp.value);
const { appBarHeightPX } = useAppTabs();
const tableRef = useTemplateRef('table');

const runTableLayoutAlgorithm = () => {
  const table = tableRef.value?.$el as HTMLDivElement | undefined;
  table?.querySelectorAll('th').forEach((th) => th.removeAttribute('width'));
  table?.querySelector('table')?.setAttribute('style', 'table-layout: auto');
  requestAnimationFrame(() => {
    table?.querySelectorAll('th').forEach((th) =>
      th.setAttribute('width', `${th.getBoundingClientRect().width}`));
    table?.querySelector('table')?.setAttribute('style', 'table-layout: fixed');
  });
};

const includeObject = setTableIncludeObjectPolicy(V1IncludeObjectPolicy.OBJECT);
const { loading, load } = useApiLoader(async (signal) => {
  searching.value = false;

  const options = {
    group: targetGroupVersion.value.group,
    version: targetGroupVersion.value.version,
    plural: targetKind.value.resource,
    namespace: selectedNamespace.value,
  };
  const listType = allNamespaces.value ? 'Cluster' : targetKind.value.scope;
  const api = isEvents.value ? anyApi.withPreMiddleware(includeObject) : anyApi;
  if (targetKind.value.verbs.includes('watch')) {
    await listAndUnwaitedWatchTable(
      objects,
      (opt) => api[`list${listType}CustomObjectAsTableRaw`]({ ...opt, ...options }, { signal }),
      notifyListingWatchErrors,
    );
  } else {
    objects.value = await api[`list${listType}CustomObjectAsTable`](options, { signal });
  }
  runTableLayoutAlgorithm();
});

const isCreationTimestamp = (c: V1TableColumnDefinition) =>
  (c.name === 'Age' && c.description.startsWith('CreationTimestamp ')) ||
  // k8s.io/apiextensions-apiserver/pkg/registry/customresource/tableconverter.New
  c.description === 'Custom resource definition column (in JSONPath format): .metadata.creationTimestamp';
const isImages = (c: V1TableColumnDefinition) => c.name === 'Images' &&
  c.description === 'Images referenced by each container in the template.';
const isHumanDuration = (c: V1TableColumnDefinition) =>
  (c.name === 'Duration' && c.description === 'Time required to complete the job.') || // batch/jobs
  (c.name === 'Last Schedule' && c.description === 'Information when was the last time the job was successfully scheduled.') || // batch/cronjobs
  (c.name === 'RequestedDuration' && c.description.startsWith('expirationSeconds')) || // certificates.k8s.io/certificatesigningrequests
  c.type === 'date'; // k8s.io/apiextensions-apiserver/pkg/registry/customresource/tableconvertor.cellForJSONValue
const isQuantity = (c: V1TableColumnDefinition) => c.format === 'quantity';
        // k8s.io/kubernetes/pkg/printers/internalversion.printPod
const isRestarts = (c: V1TableColumnDefinition) => c.name === 'Restarts' &&
  c.description === 'The number of times the containers in this pod have been restarted and when the last container in this pod has restarted.';

// for where exact ts is not interesting enough for us to get from full object
// TODO store estimated timestamp (need update ts tracking) and present from it?
const sortHumanDuration = (a: string, b: string) =>
  (durationToS(a) ?? 0) - (durationToS(b) ?? 0);
// metrics.k8s.io/v1beta1 uses this (k8s.io/apimachinery/pkg/api/resource.Quantity)
const sortQuantity = (a: string, b: string) => (real(a) ?? 0) - (real(b) ?? 0);
const sortInteger = (a: string, b: string) => parseInt(a, 10) - parseInt(b, 10);

const columns = computed<Array<{
  title: string,
  key: string,
  description?: string,
}>>(() =>
  ((targetKind.value.scope === V2ResourceScope.Namespaced && allNamespaces.value) ? [{
    title: 'Namespace',
    key: 'object.metadata.namespace',
    description: `Namespace defines the space within which each name must be unique. An empty namespace is equivalent to the "default" namespace, but "default" is the canonical representation. Not all objects are required to be scoped to a namespace - the value of this field for those objects will be empty.\n\nMust be a DNS_LABEL. Cannot be updated. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces`,
  }] : []).concat(objects.value.columnDefinitions.filter((c) =>
      verbose.value || c.priority === 0).map((c, i) => {
    const meta = {
      title: c.name,
      description: c.description,
    };

    if (isEvents.value) {
      // k8s.io/kubernetes/pkg/printers/internalversion.printEvent()
      if (c.name === 'Last Seen') {
        const coreGetLastTimestamp = (r: V1TableRow<CoreV1Event>) =>
          r.object.lastTimestamp ?? r.object.firstTimestamp ?? r.object.eventTime;
        const eventsGetLastTimestamp = (r: V1TableRow<EventsV1Event>) =>
          r.object.deprecatedLastTimestamp ?? r.object.deprecatedFirstTimestamp ?? r.object.eventTime;
        return {
          ...meta,
          key: TimestampColumns.LAST_SEEN,
          value: targetGroupVersion.value.group ? eventsGetLastTimestamp : coreGetLastTimestamp,
        };
      } else if (c.name === 'First Seen') {
        const coreGetFirstTimestamp = (r: V1TableRow<CoreV1Event>) =>
          r.object.firstTimestamp ?? r.object.eventTime;
        const eventsGetFirstTimestamp = (r: V1TableRow<EventsV1Event>) =>
          r.object.deprecatedFirstTimestamp ?? r.object.eventTime;
        return {
          ...meta,
          key: TimestampColumns.FIRST_SEEN,
          value: targetGroupVersion.value.group ? eventsGetFirstTimestamp : coreGetFirstTimestamp,
        };
      }
    }

    if (isCreationTimestamp(c)){
      return {
        ...meta,
        key: TimestampColumns.CREATION_TIMESTAMP,
        value: (r: V1TableRow<V1PartialObjectMetadata>) => r.object.metadata!.creationTimestamp,
        // reverse (time-to-timestamp from timestamp)
        // optional chaining to avoid crash on column def change (more a vuetify bug?)
        sort: (a: string, b: string) => b?.localeCompare(a),
      };
    } else if (isImages(c)) {
      return {
        ...meta,
        key: ImageColumns.IMAGES,
        value: (r: V1TableRow<V1PartialObjectMetadata>) => r.cells[i],
      };
    }

    return {
      ...meta,
      key: `cells.${i}`,
      sort: isHumanDuration(c) ? sortHumanDuration : isQuantity(c) ? sortQuantity : isRestarts(c) ? sortInteger : undefined,
    };
  })),
);

const order = ref([]);
const search = ref('');
const searching = ref(false);

// TODO a way to trigger search without keyboard
useEventListener(window, 'keydown', (e) => {
  if (e.ctrlKey && e.key == 'f') {
    searching.value = !searching.value;
    e.preventDefault();
  }
});

const maybeGetSchema = (r: ObjectRecord) =>
  openAPISchemaDiscovery.getJSONSchema({
    group: r.api.group,
    version: r.api.version,
    type: r.kind,
  }).catch((e) => console.log('Failed to get schema', e));

const inspectObject = async (obj: V1PartialObjectMetadata) => {
  const gv = targetGroupVersion.value, kind = targetKind.value;
  const key = uniqueKeyForObject({
    apiVersion: gv.groupVersion,
    kind: kind.responseKind.kind,
    metadata: obj.metadata,
  });
  if (inspectedObjects.value.has(key)) {
    tab.value = key;
    return;
  }

  const r: ObjectRecord = {
    object: '',
    metadata: obj.metadata!,
    api: {
      group: gv.group,
      version: gv.version,
      plural: kind.resource,
    },
    kind,
    editing: false,
    unsaved: false,
  };

  await Promise.all([
    (async () => r.object = await (await anyApi[
      `get${kind.scope}CustomObjectRaw`
      ]({
        ...r.api,
        name: obj.metadata!.name!,
        namespace: obj.metadata!.namespace!,
      }, asYAML)).raw.text())(),
    (async () => r.schema = await maybeGetSchema(r) ?? undefined)(),
  ]);

  inspectedObjects.value.set(key, r);
  // make sure transition gets right
  requestAnimationFrame(() => tab.value = key);
};

const rowClick = (
  _: unknown,
  slotProps: { item: Required<V1Table<V1PartialObjectMetadata>>['rows'][0] },
) => inspectObject(slotProps.item.object);

const save = async (r: ObjectRecord, key: string) => {
  const method = r.metadata.name === NAME_NEW ? 'create' : 'replace';
  const metadata = method === 'create' ? parseInput(r.object)?.metadata : r.metadata;

  r.object = await (await anyApi[
    `${method}${r.kind.scope}CustomObjectRaw`
  ]({
    ...r.api,
    name: metadata?.name ?? '',
    namespace: metadata?.namespace ?? '',
    fieldValidation: 'Strict',
    body: new Blob([r.object]),
  }, chainOverrideFunction(byYAML, asYAML))).raw.text();

  r.unsaved = false;
  r.editing = false;
  r.selection = undefined;
  const parsedObject = parse(r.object);
  r.metadata = parsedObject.metadata;

  if (method === 'create') {
    const newKey = uniqueKeyForObject(parsedObject);
    inspectedObjects.value.set(newKey, r);
    tab.value = newKey;
    // removing key in this tick would affect tab selection
    nextTick(() => inspectedObjects.value.delete(key));
  }
};

const _delete = async (r: ObjectRecord, key: string) => {
  await anyApi[`delete${r.kind.scope}CustomObject`]({
    ...r.api,
    name: r.metadata.name!,
    namespace: r.metadata.namespace!,
    propagationPolicy: V1DeletePropagation.BACKGROUND,
  });
  closeTab(key);
};

const newDraft = async () => {
  const gv = targetGroupVersion.value, kind = targetKind.value;
  const name = createNameId();
  const metaTemplate: KubernetesObject = {
    apiVersion: gv.groupVersion,
    kind: kind.responseKind.kind,
    metadata: {
      namespace: kind.scope === V2ResourceScope.Namespaced ? selectedNamespace.value : undefined,
      labels: {},
      annotations: {},
      // make it order last to be friendlier
      name,
    },
  };
  // TODO generate skeleton from openapi types as fallback?
  const contentTemplate = templates[metaTemplate.apiVersion!]?.[metaTemplate.kind!] ?? {};
  const doc = stringify({ ...metaTemplate, ...contentTemplate });
  const namePos = doc.indexOf(name);
  const r: ObjectRecord = {
    object: doc,
    metadata: {
      name: NAME_NEW,
    },
    api: {
      group: gv.group,
      version: gv.version,
      plural: kind.resource,
    },
    kind,
    editing: true,
    unsaved: true,
    selection: { anchor: namePos + name.length, head: namePos },
  };

  r.schema = await maybeGetSchema(r) ?? undefined;

  const key = crypto.randomUUID();
  inspectedObjects.value.set(key, r);
  // make sure transition gets right
  requestAnimationFrame(() => tab.value = key);
};

const closeTab = (key: string) => {
  tab.value = 'explore';
  inspectedObjects.value.delete(key);
};

const nsName = (m: V1ObjectMeta) =>
  m.namespace ? `${m.namespace}/${m.name}` : m.name!;

const title = (o: ObjectRecord) =>
  `${o.kind.shortNames?.[0] ?? o.kind.responseKind.kind}: ${truncate(o.metadata.name!, 16)}`;

watch(targetGroupVersion, () => targetKind.value = defaultTargetKind());
watch([targetKind, allNamespaces, selectedNamespace], load, { immediate: true });
watch(selectedNamespace, loadPermissions);
watch(verbose, runTableLayoutAlgorithm);
watch([targetKind, verbose], () => order.value = []);
// hack: v-data-table-virtual does not update properly when display: none
// (0 height), force rendering range calculation when back
watch(tab, (v) => v === 'explore' &&
  requestAnimationFrame(() => triggerRef(objects)));
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="explore">Explore</VTab>
    <DynamicTab v-for="[key, r] in inspectedObjects" :key="key"
      :value="key" :description="`${r.kind.responseKind.kind}: ${nsName(r.metadata)}`"
      :title="title(r)" :alerting="r.unsaved" @close="closeTab(key)" />
  </AppTabs>
  <TabsWindow v-model="tab">
    <WindowItem value="explore" :transition="false">
      <div class="d-flex flex-column"
        v-resize-observer="runTableLayoutAlgorithm"
        :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`">
        <VRow class="flex-grow-0 mb-1" :dense="smAndDown">
          <VCol cols="6" sm="">
            <VAutocomplete label="API version" v-model="targetGroupVersion"
              :items="groupVersions" return-object hide-details
              item-title="groupVersion" auto-select-first />
          </VCol>
          <VCol cols="6" sm="">
            <VAutocomplete label="Kind" v-model="targetKind" :items="kinds"
              return-object hide-details item-title="responseKind.kind"
              auto-select-first />
          </VCol>
          <VCol md="3" sm="4">
            <div>
              <VCheckboxBtn :disabled="targetKind.scope === V2ResourceScope.Cluster"
                label="All namespaces" v-model="allNamespaces" density="compact" />
              <HoverTooltip v-if="targetKind.scope === V2ResourceScope.Cluster"
                activator="parent" text="Selected type is not namespaced" />
            </div>
            <VCheckboxBtn label="Verbose" v-model="verbose" density="compact" />
          </VCol>
        </VRow>
        <div v-if="!targetKind.verbs.includes('watch')"
          class="flex-grow-0 text-caption text-medium-emphasis mb-2">
          This kind does not support watch operation, last updated
          <HumanDurationSince class="font-weight-bold" :since="lastUpdatedAt" ago />
          <VBtn variant="text" size="x-small" color="primary" @click="load">refresh</VBtn>
        </div>
        <VDataTableVirtual class="flex-shrink-1 position-relative"
          style="min-height: 0" ref="table"
          :items="objects.rows ?? []" :headers="columns" :loading="loading"
          :search="searching ? search : undefined" :sort-by="order"
          hover fixed-header @click:row="rowClick">
          <template #[`body.prepend`]>
            <div v-if="searching" class="position-absolute top-0 right-0 ma-2"
              style="z-index: 2">
              <VTextField style="min-width: 20em" v-model="search"
                placeholder="Search" prepend-inner-icon="mdi-magnify"
                variant="solo-filled" density="compact"
                autofocus clearable hide-details persistent-clear
                @keydown.esc="searching = false"
                @click:clear="searching = false" />
            </div>
          </template>
          <!-- TODO: ask vuetify to open up VDataTableHeaderCell -->
          <template v-for="(c, i) in columns" #[`header.${c.key}`]="{ column, getSortIcon }" :key="i">
            <div class="v-data-table-header__content">
              <span>
                {{ column.title }}
                <HoverTooltip v-if="c.description" :text="c.description"
                  activator="parent" markdown />
              </span>
              <VIcon v-if="column.sortable" key="icon" class="v-data-table-header__sort-icon" :icon="getSortIcon(column)" />
            </div>
          </template>
          <template v-for="c in TimestampColumns" :key="c" #[`item.${c}`]="{ value }">
            <HumanDurationSince :since="new Date(value)" />
          </template>
          <template v-for="c in ImageColumns" :key="c" #[`item.${c}`]="{ value }">
            <template v-for="i in value.split(',')" :key="i">
              <LinkedImage :image="i" />
              <br>
            </template>
          </template>
        </VDataTableVirtual>
        <!-- TODO we should show info for type somewhere -->
        <FixedFab v-if="targetKind.verbs.includes('create')" icon="$plus"
          :disabled="!permissionsStore.mayAllows(loadedNamespace, targetGroupVersion.group ?? '', targetKind.resource, '*', 'create')"
          @click="newDraft" />
      </div>
    </WindowItem>
    <WindowItem v-for="[key, r] in inspectedObjects" :key="key" :value="key">
      <YAMLEditor :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`"
        v-model="r.object" :schema="r.schema" :disabled="!r.editing"
        :selection="r.selection" :key="r.metadata.resourceVersion" @change="r.unsaved = true" />

      <FixedFab v-if="r.editing" icon="mdi-content-save" @click="save(r, key)" />
      <SpeedDialFab v-else-if="targetKind.verbs.includes('delete') || targetKind.verbs.includes('update')">
        <SpeedDialBtn v-if="targetKind.verbs.includes('delete')"
          key="1" label="Delete" icon="mdi-delete"
          :disabled="!permissionsStore.mayAllows(loadedNamespace, targetGroupVersion.group ?? '', targetKind.resource, r.metadata.name!, 'delete')"
          @click="_delete(r, key)" />
        <SpeedDialBtn v-if="targetKind.verbs.includes('update')"
          key="2" label="Edit" icon="$edit"
          :disabled="!permissionsStore.mayAllows(loadedNamespace, targetGroupVersion.group ?? '', targetKind.resource, r.metadata.name!, 'delete')"
          @click="r.editing = true" />
      </SpeedDialFab>
    </WindowItem>
  </TabsWindow>
</template>

<style scoped>
:deep(td) {
  overflow-wrap: break-word;
}
</style>
