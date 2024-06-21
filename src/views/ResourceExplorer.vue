<script setup lang="ts">
import {
  VAutocomplete,
  VBtn,
  VCheckbox,
  VCol,
  VDataTable,
  VDataTableRow,
  VIcon,
  VRow,
  VTab,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import FixedFab from '@/components/FixedFab.vue';
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import SpeedDialBtn from '@/components/SpeedDialBtn.vue';
import SpeedDialFab from '@/components/SpeedDialFab.vue';
import TabsWindow from '@/components/TabsWindow.vue';
import WindowItem from '@/components/WindowItem.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import { computed, watch, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDisplay } from 'vuetify';
import { timestamp, useLastChanged, useNow, useTimeAgo } from '@vueuse/core';
import { useAbortController } from '@/composables/abortController';
import { useAppTabs } from '@/composables/appTabs';
import { useLoading } from '@/composables/loading';
import { useNamespaces } from '@/stores/namespaces';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useApiConfig } from '@/stores/apiConfig';
import { useOpenAPISchemaDiscovery } from '@/stores/openAPISchemaDiscovery';
import { useErrorPresentation } from '@/stores/errorPresentation';
import type { V1ObjectMeta } from '@/kubernetes-api/src';
import {
  AnyApi,
  type V1Table, type V1PartialObjectMetadata, type V1TableColumnDefinition, type V1TableRow,
} from '@/utils/AnyApi';
import { asYAML, fromYAML, chainOverrideFunction } from '@/utils/api';
import { V2ResourceScope, type V2APIResourceDiscovery, type V2APIVersionDiscovery } from '@/utils/discoveryV2';
import { uniqueKeyForObject, type KubernetesObject } from '@/utils/objects';
import { listAndUnwaitedWatchTable } from '@/utils/watch';
import { truncate, truncateStart } from '@/utils/text';
import { humanDuration } from '@/utils/duration';
import { nonNullableRef } from '@/utils/reactivity';
import { PresentedError } from '@/utils/PresentedError';
import type { JSONSchema4 } from 'json-schema';
import { stringify, parse } from 'yaml';

type GroupVersion = V2APIVersionDiscovery & { group?: string, groupVersion: string };

interface ObjectRecord {
  schema?: JSONSchema4,
  object: string,
  metadata: V1ObjectMeta,
  gv: GroupVersion,
  type: V2APIResourceDiscovery,
  editing: boolean,
  unsaved: boolean,
  selection?: { anchor: number, head: number },
}

const NAME_NEW = '(new)'; // must be invalid
const CREATION_TIMESTAMP_COLUMN = 'creationTimestamp';

const apiConfigStore = useApiConfig();
const openAPISchemaDiscovery = useOpenAPISchemaDiscovery();
const anyApi = new AnyApi(await apiConfigStore.getConfig());

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces();
const { selectedNamespace } = storeToRefs(namespacesStore);
const allNamespaces = ref(false);
const groupVersions: Array<GroupVersion> = [];
(await useApisDiscovery().getGroups()).forEach((g) => {
  const knownResources: Array<string> = [];
  groupVersions.push(...g.versions.map((v) => {
    const resources = v.resources
      .filter((r) => !knownResources.includes(r.resource))
      .filter((r) => r.verbs.includes('list'));
    knownResources.push(...resources.map((r) => r.resource));

    return {
      ...v,
      resources,
      group: g.metadata?.name,
      groupVersion: g.metadata?.name ? `${g.metadata.name}/${v.version}` : v.version,
    };
  }).filter((v) => v.resources.length));
});
const targetGroupVersion = nonNullableRef(groupVersions[0]);

const types = computed(() => targetGroupVersion.value.resources);

const defaultTargetType = () =>
  types.value.find((v) => v.verbs.includes('watch')) ?? types.value[0];

const targetType = nonNullableRef(defaultTargetType());
const objects = ref<V1Table<V1PartialObjectMetadata>>({
  columnDefinitions: [],
  rows: [],
});
const lastUpdatedAt = useLastChanged(objects, { initialValue: timestamp() });
const lastUpdated = useTimeAgo(lastUpdatedAt);
const tab = ref('explore');
const inspectedObjects = ref<Map<string, ObjectRecord>>(new Map());
const { smAndDown, xlAndUp } = useDisplay();
const verbose = ref(xlAndUp.value);
const { appBarHeightPX } = useAppTabs();

const { abort: abortRequests, signal } = useAbortController();

const { loading, load } = useLoading(async () => {
  abortRequests();

  const options = {
    group: targetGroupVersion.value.group,
    version: targetGroupVersion.value.version,
    plural: targetType.value.resource,
    namespace: selectedNamespace.value,
  };
  const listType = allNamespaces.value ? 'Cluster' : targetType.value.scope;
  if (targetType.value.verbs.includes('watch')) {
    await listAndUnwaitedWatchTable(
      objects,
      (opt) => anyApi[`list${listType}CustomObjectAsTableRaw`]({ ...opt, ...options }, { signal: signal.value }),
      (e) => useErrorPresentation().pendingError = e,
    );
  } else {
    objects.value = await anyApi[`list${listType}CustomObjectAsTable`](options);
  }
});

const isCreationTimestamp = (c: V1TableColumnDefinition) =>
  (c.name === 'Age' && c.description.startsWith('CreationTimestamp ')) ||
  // k8s.io/apiextensions-apiserver/pkg/registry/customresource/tableconverter.New
  c.description === 'Custom resource definition column (in JSONPath format): .metadata.creationTimestamp';

const columns = computed<Array<{
  title: string,
  key: string,
  description?: string,
}>>(() =>
  ((targetType.value.scope === V2ResourceScope.Namespaced && allNamespaces.value) ? [{
    title: 'Namespace',
    key: 'object.metadata.namespace',
    description: `Namespace defines the space within which each name must be unique. An empty namespace is equivalent to the "default" namespace, but "default" is the canonical representation. Not all objects are required to be scoped to a namespace - the value of this field for those objects will be empty.\n\nMust be a DNS_LABEL. Cannot be updated. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces`,
  }] : []).concat(
    objects.value.columnDefinitions
      .filter((c) => verbose.value || c.priority === 0)
      .map((c, i) => {
        if (isCreationTimestamp(c)){
          return {
            title: c.name,
            key: CREATION_TIMESTAMP_COLUMN,
            value: (r: V1TableRow<V1PartialObjectMetadata>) => r.object.metadata!.creationTimestamp,
            description: c.description,
            // reverse (time-to-timestamp from timestamp)
            sort: (a: string, b: string) => b.localeCompare(a),
          };
        }

        const column = {
          title: c.name,
          key: `cells.${i}`,
          description: c.description,
        };
        // k8s.io/kubernetes/pkg/printers/internalversion.printPod
        if (c.name === 'Restarts' && c.description === 'The number of times the containers in this pod have been restarted and when the last container in this pod has restarted.') {
          return {
            ...column,
            sort: (a: string, b: string) => parseInt(a, 10) - parseInt(b, 10),
          };
        }
        return column;
      })
  ),
);
const columnsContainCreationTimestamp = computed(() =>
  columns.value.some(c => c.key === CREATION_TIMESTAMP_COLUMN));

const injectTime = useNow({ interval: 5000 });
const table = computed(() => {
  const rows = objects.value.rows ?? [];
  if (rows.length && columnsContainCreationTimestamp.value) {
    return { rows, _update: injectTime.value };
  }
  return { rows };
});

const maybeGetSchema = (r: ObjectRecord) =>
  openAPISchemaDiscovery.getJSONSchema({
    group: r.gv.group,
    version: r.gv.version,
    type: r.type,
  }).catch((e) => console.log('Failed to get schema', e));

const inspectObject = async (obj: V1PartialObjectMetadata) => {
  const gv = targetGroupVersion.value, type = targetType.value;
  const key = uniqueKeyForObject({
    apiVersion: gv.groupVersion,
    kind: type.responseKind.kind,
    metadata: obj.metadata,
  });
  const entry = inspectedObjects.value.get(key);
  if (entry) {
    tab.value = key;
    return;
  }

  const r: ObjectRecord = {
    object: await (await anyApi[
      `get${type.scope}CustomObjectRaw`
      ]({
        group: gv.group,
        version: gv.version,
        plural: type.resource,
        name: obj.metadata!.name!,
        namespace: obj.metadata!.namespace!,
      }, asYAML)).raw.text(),
    metadata: obj.metadata!,
    gv,
    type,
    editing: false,
    unsaved: false,
  };

  r.schema = await maybeGetSchema(r) ?? undefined;

  inspectedObjects.value.set(key, r);
  tab.value = key;
};

const save = async (r: ObjectRecord) => {
  const method = r.metadata.name === NAME_NEW ? 'create' : 'replace';
  let createMeta;
  if (method === 'create') {
    try {
      createMeta = parse(r.object)?.metadata;
    } catch (e) {
      throw new PresentedError(`Cannot parse YAML:\n${e}`);
    }
  }

  // TODO apply: diff, ssa? how to delete field?
  r.object = await (await anyApi[
    `${method}${r.type.scope}CustomObjectRaw`
  ]({
    group: r.gv.group,
    version: r.gv.version,
    plural: r.type.resource,
    name: method === 'create' ? createMeta?.name : r.metadata.name!,
    namespace: method === 'create' ? createMeta?.namespace : r.metadata.namespace!,
    fieldValidation: 'Strict',
    body: new Blob([r.object], { type: 'application/yaml' }),
  }, chainOverrideFunction(fromYAML, asYAML))).raw.text();
  if (method === 'create') {
    r.metadata.name = createMeta?.name;
    r.metadata.namespace = createMeta?.namespace;
  }
  r.unsaved = false;
  r.editing = false;

  // TODO create: reset key?
};

const _delete = async (r: ObjectRecord, key: string) => {
  await anyApi[`delete${r.type.scope}CustomObject`]({
    group: r.gv.group,
    version: r.gv.version,
    plural: r.type.resource,
    name: r.metadata.name!,
    namespace: r.metadata.namespace!,
  });
  closeTab(key);
};

const newDraft = async () => {
  const gv = targetGroupVersion.value, type = targetType.value;
  const template: KubernetesObject = {
    apiVersion: gv.groupVersion,
    kind: type.responseKind.kind,
    metadata: {
      namespace: type.scope === V2ResourceScope.Namespaced ? selectedNamespace.value : undefined,
      // make it order last to be friendlier
      name: crypto.randomUUID(),
    },
  };
  const doc = stringify(template, null, { indentSeq: true });
  const r: ObjectRecord = {
    object: doc,
    metadata: {
      name: NAME_NEW,
    },
    gv,
    type,
    editing: true,
    unsaved: true,
    selection: { anchor: doc.length - 1, head: doc.length - 1 - template.metadata!.name!.length},
  };

  r.schema = await maybeGetSchema(r) ?? undefined;

  inspectedObjects.value.set(template.metadata!.name!, r);
  tab.value = template.metadata!.name!;
};

const closeTab = (key: string) => {
  tab.value = 'explore';
  inspectedObjects.value.delete(key);
};

const nsName = (m: V1ObjectMeta) =>
  m.namespace ? `${m.namespace}/${m.name}` : m.name!;

const nsNameShort = (m: V1ObjectMeta) =>
  m.namespace ? `${truncate(m.namespace, 8)}/${truncateStart(m.name!, 8)}` :
  truncate(m.name!, 17);

const title = (o: ObjectRecord) =>
  `${o.type.shortNames ? o.type.shortNames[0] : o.type.responseKind.kind}: ${nsNameShort(o.metadata)}`;

watch(targetGroupVersion, () => targetType.value = defaultTargetType());
watch([targetType, allNamespaces, selectedNamespace], load, { immediate: true });
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="explore">Explore</VTab>
    <DynamicTab v-for="[key, r] in inspectedObjects" :key="key"
      :value="key" :description="`${r.type.responseKind.kind}: ${nsName(r.metadata)}`"
      :title="title(r)" :alerting="r.unsaved" @close="() => closeTab(key)" />
  </AppTabs>
  <TabsWindow v-model="tab">
    <WindowItem value="explore">
      <VRow class="mb-1" :dense="smAndDown">
        <VCol cols="6" sm="">
          <VAutocomplete label="API version" v-model="targetGroupVersion"
            :items="groupVersions" return-object hide-details
            item-title="groupVersion" auto-select-first />
        </VCol>
        <VCol cols="6" sm="">
          <VAutocomplete label="Type" v-model="targetType" :items="types"
            return-object hide-details item-title="responseKind.kind"
            auto-select-first />
        </VCol>
        <VCol md="3" sm="4">
          <div>
            <VCheckbox :disabled="targetType.scope === V2ResourceScope.Cluster"
              class="checkbox-intense" label="All namespaces"
              v-model="allNamespaces" hide-details density="compact" />
            <LinkedTooltip v-if="targetType.scope === V2ResourceScope.Cluster"
              activator="parent" text="Selected type is not namespaced" />
          </div>
          <VCheckbox class="checkbox-intense" label="Verbose" v-model="verbose"
            hide-details density="compact" />
        </VCol>
      </VRow>
      <div v-if="!targetType.verbs.includes('watch')"
        class="text-caption text-medium-emphasis mb-2">
        This type does not support watch operation, last updated
        <span class="font-weight-bold">
          {{ lastUpdated }}
          <LinkedTooltip :text="new Date(lastUpdatedAt).toLocaleString()" activator="parent" />
        </span>
        <VBtn variant="text" size="x-small" color="primary" @click="load">refresh</VBtn>
      </div>
      <VDataTable hover class="data-table-auto"
        items-per-page="-1" :items="table.rows" :headers="columns"
        :loading="loading" hide-default-footer>
        <!-- TODO: ask vuetify to open up VDataTableHeaderCell -->
        <template v-for="(c, i) in columns" #[`header.${c.key}`]="{ column, getSortIcon }" :key="i">
          <div class="v-data-table-header__content h-100 width-fit-content">
            <span>{{ column.title }}</span>
            <VIcon v-if="column.sortable" key="icon" class="v-data-table-header__sort-icon" :icon="getSortIcon(column)" />
            <LinkedTooltip v-if="c.description" :text="c.description" activator="parent" />
          </div>
        </template>
        <template #item="{ props: itemProps }">
          <VDataTableRow v-bind="itemProps" @click="inspectObject(itemProps.item.raw.object)">
            <template #[`item.${CREATION_TIMESTAMP_COLUMN}`]="{ value }">
              <span>
                {{ humanDuration((new Date()).valueOf() - (new Date(value)).valueOf()) }}
                <LinkedTooltip :text="(new Date(value)).toLocaleString()" activator="parent" />
              </span>
            </template>
          </VDataTableRow>
        </template>
      </VDataTable>
      <!-- TODO we should show info for type somewhere -->
      <FixedFab v-if="targetType.verbs.includes('create')" icon="$plus" @click="newDraft" />
    </WindowItem>
    <WindowItem v-for="[key, r] in inspectedObjects" :key="key" :value="key">
      <YAMLEditor :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`"
        v-model="r.object" :schema="r.schema" :disabled="!r.editing"
        :selection="r.selection" @change="() => r.unsaved = true" />

      <FixedFab v-if="r.editing" icon="mdi-content-save" @click="() => save(r)" />
      <SpeedDialFab v-else-if="(targetType.verbs.includes('delete') || targetType.verbs.includes('update'))">
        <SpeedDialBtn key="1" label="Delete" icon="mdi-delete"
          :disabled="!targetType.verbs.includes('delete')"
          @click="() => _delete(r, key)" />
        <SpeedDialBtn key="2" label="Edit" icon="$edit"
          :disabled="!targetType.verbs.includes('update')"
          @click="() => r.editing = true" />
      </SpeedDialFab>
    </WindowItem>
  </TabsWindow>
</template>

<style>
.data-table-auto table {
  table-layout: auto !important;
}

.checkbox-intense > .v-input__control > .v-selection-control {
  min-height: unset !important;
}

.width-fit-content {
  width: fit-content;
}
</style>
