<script setup lang="ts">
import {
  VAutocomplete,
  VBtn,
  VCheckbox,
  VCol,
  VDataTable,
  VDataTableRow,
  VFab,
  VIcon,
  VRow,
  VSpeedDial,
  VTab,
  VWindow,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import SpeedDialBtn from '@/components/SpeedDialBtn.vue';
import WindowItem from '@/components/WindowItem.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import { computed, watch, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDisplay } from 'vuetify';
import { timestamp, useLastChanged, useTimeAgo } from '@vueuse/core';
import { useAbortController } from '@/composables/abortController';
import { useAppTabs } from '@/composables/appTabs';
import { useNamespaces } from '@/stores/namespaces';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useApiConfig } from '@/stores/apiConfig';
import { useOpenAPISchemaDiscovery } from '@/stores/openAPISchemaDiscovery';
import { useErrorPresentation } from '@/stores/errorPresentation';
import type { V1ObjectMeta } from '@/kubernetes-api/src';
import { AnyApi, asYAML, type V1Table, type V1PartialObjectMetadata } from '@/utils/AnyApi';
import type { JSONSchema4 } from 'json-schema';
import { V2ResourceScope, type V2APIResourceDiscovery, type V2APIVersionDiscovery } from '@/utils/discoveryV2';
import { uniqueKeyForObject } from '@/utils/objects';
import { listAndUnwaitedWatchTable } from '@/utils/watch';
import { truncate, truncateStart } from '@/utils/text';

type GroupVersion = V2APIVersionDiscovery & { group?: string, groupVersion: string };

interface ObjectRecord {
  schema?: JSONSchema4,
  object: string,
  metadata: V1ObjectMeta,
  gv: GroupVersion,
  type: V2APIResourceDiscovery,
  editing: boolean,
  unsaved: boolean,
}

const EMPTY_V1_TABLE: V1Table<V1PartialObjectMetadata> = {
  columnDefinitions: [],
  rows: [],
};
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
const targetGroupVersion = ref(groupVersions[0]);

const types = computed(() => targetGroupVersion.value.resources);

const defaultTargetType = () =>
  types.value.find((v) => v.verbs.includes('watch')) ?? types.value[0];

const targetType = ref(defaultTargetType());
const objects = ref(EMPTY_V1_TABLE);
const lastUpdatedAt = useLastChanged(objects, { initialValue: timestamp() });
const lastUpdated = useTimeAgo(lastUpdatedAt);
const objectsLoading = ref(false);
const tab = ref('explore');
const inspectedObjects = ref<Map<string, ObjectRecord>>(new Map());
const { smAndDown, xlAndUp } = useDisplay();
const verbose = ref(xlAndUp.value);
const { appBarHeightPX } = useAppTabs();

const { abort: abortRequests, signal } = useAbortController();

const listObjects = async () => {
  abortRequests();

  objectsLoading.value = true;
  const options = {
    group: targetGroupVersion.value.group,
    version: targetGroupVersion.value.version,
    plural: targetType.value.resource,
    namespace: selectedNamespace.value,
  };
  const listType =
    (targetType.value.scope === V2ResourceScope.Namespaced && !allNamespaces.value) ?
    'Namespaced' : 'Cluster';
  if (targetType.value.verbs.includes('watch')) {
    await listAndUnwaitedWatchTable(
      objects,
      (opt) => anyApi[`list${listType}CustomObjectAsTableRaw`](opt, { signal: signal.value }),
      options,
      (e) => useErrorPresentation().pendingError = e,
    );
  } else {
    objects.value = await anyApi[`list${listType}CustomObjectAsTable`](options);
  }
  objectsLoading.value = false;
};

const columns = computed<Array<{
  title: string,
  key: string,
  description?: string,
}>>(() =>
  ((targetType.value.scope === V2ResourceScope.Namespaced && allNamespaces.value) ? [{
    title: 'Namespace',
    key: 'object.metadata.namespace',
  }] : []).concat(
    objects.value.columnDefinitions
      .filter((c) => verbose.value || c.priority === 0)
      .map((c, i) => ({
        title: c.name,
        key: `cells.${i}`,
        description: c.description,
      }))
  ),
);

const inspectObject = async (obj: V1PartialObjectMetadata) => {
  const objWithKind = {
    ...obj,
    apiVersion: targetGroupVersion.value.groupVersion,
    kind: targetType.value.responseKind.kind,
  };
  const key = uniqueKeyForObject(objWithKind);
  const entry = inspectedObjects.value.get(key);
  if (entry) {
    tab.value = key;
    return;
  }

  const options = {
    group: targetGroupVersion.value.group,
    version: targetGroupVersion.value.version,
    plural: targetType.value.resource,
    name: obj.metadata!.name!,
    namespace: obj.metadata!.namespace,
  };
  const r: ObjectRecord = {
    object: await (await anyApi.withPreMiddleware(asYAML)[
      `get${obj.metadata!.namespace ? 'Namespaced' : 'Cluster'}CustomObjectRaw`
    ](options as typeof options & { namespace: string })).raw.text(),
    metadata: obj.metadata!,
    gv: targetGroupVersion.value,
    type: targetType.value,
    editing: false,
    unsaved: false,
  };

  try {
    r.schema = await openAPISchemaDiscovery.getJSONSchema({
      group: r.gv.group,
      version: r.gv.version,
      type: r.type,
    });
  } catch (e) {
    //shrug
    console.log('Failed to get schema', e);
  }

  inspectedObjects.value.set(key, r);
  tab.value = key;
};

const apply = (r: ObjectRecord) => {
  alert(`apply ${r.object}`);
};

const _delete = async (r: ObjectRecord, key: string) => {
  await anyApi[`delete${r.metadata.namespace ? 'Namespaced' : 'Cluster'}CustomObject`]({
    group: r.gv.group,
    version: r.gv.version,
    plural: r.type.resource,
    name: r.metadata.name!,
    namespace: r.metadata.namespace!,
  });
  closeTab(key);
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
watch([targetType, allNamespaces, selectedNamespace], listObjects, { immediate: true });
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="explore">Explore</VTab>
    <DynamicTab v-for="[key, r] in inspectedObjects" :key="key"
      :value="key" :description="`${r.type.responseKind.kind}: ${nsName(r.metadata)}`"
      :title="title(r)" :alerting="r.unsaved" @close="closeTab(key)" />
  </AppTabs>
  <VWindow v-model="tab" :touch="false">
    <WindowItem value="explore">
      <VRow class="mb-1" :dense="smAndDown">
        <VCol cols="6" sm="">
          <VAutocomplete label="API version" v-model="targetGroupVersion"
            :items="groupVersions" return-object hide-details item-title="groupVersion" />
        </VCol>
        <VCol cols="6" sm="">
          <VAutocomplete label="Type" v-model="targetType" :items="types"
            return-object hide-details item-title="responseKind.kind" />
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
        <VBtn variant="text" size="x-small" color="primary" @click="listObjects">refresh</VBtn>
      </div>
      <VDataTable hover fixed-header class="data-table-auto"
        items-per-page="-1" :items="objects.rows ?? []" :headers="columns"
        :loading="objectsLoading" :mobile="false">
        <!-- TODO: ask vuetify to open up VDataTableHeaderCell -->
        <template v-for="(c, i) in columns" #[`header.${c.key}`]="{ column, getSortIcon }" :key="i">
          <div class="v-data-table-header__content h-100 width-fit-content">
            <span>{{ column.title }}</span>
            <VIcon v-if="column.sortable" key="icon" class="v-data-table-header__sort-icon" :icon="getSortIcon(column)" />
            <LinkedTooltip v-if="c.description" :text="c.description" activator="parent" />
          </div>
        </template>
        <template #item="{ props: itemProps }">
          <VDataTableRow v-bind="itemProps" @click="inspectObject(itemProps.item.raw.object)" />
        </template>
        <template #bottom />
      </VDataTable>
    </WindowItem>
    <WindowItem v-for="[key, r] in inspectedObjects" :key="key" :value="key">
      <YAMLEditor :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`"
        v-model="r.object" :schema="r.schema" :disabled="!r.editing"
        @change="() => r.unsaved = true" />
      <!-- XXX: location seems not relative to fab -->
      <VSpeedDial v-if="!r.editing" location="top end" :offset="[ 64, -4 ]" scrim origin="bottom end">
        <template #activator="{ isActive, props }">
          <VFab :icon="isActive ? '$close' : 'mdi-dots-vertical'" color="primary" absolute v-bind="props" />
        </template>
        <SpeedDialBtn key="1" label="Delete" icon="mdi-delete" @click="() => _delete(r, key)" />
        <SpeedDialBtn key="2" label="Edit" icon="$edit" @click="() => r.editing = true" />
      </VSpeedDial>
      <VFab v-else icon="mdi-content-save" color="primary" absolute @click="() => apply(r)" />
    </WindowItem>
  </VWindow>
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
