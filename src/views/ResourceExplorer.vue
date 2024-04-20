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
  VWindow,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import WindowItem from '@/components/WindowItem.vue';
import YAMLViewer from '@/components/YAMLViewer.vue';
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
import { AnyApi, asYAML, type V1Table, type V1PartialObjectMetadata } from '@/utils/AnyApi';
import { openapiSchemaToJsonSchema } from '@openapi-contrib/openapi-schema-to-json-schema';
import type { OpenAPIV3 } from 'openapi-types';
import type { JSONSchema4 } from 'json-schema';
import { V2ResourceScope, type V2APIGroupDiscovery } from '@/utils/discoveryV2';
import { dereference } from '@/utils/schema';
import { uniqueKeyForObject, type KubernetesObject } from '@/utils/objects';
import { listAndUnwaitedWatchTable } from '@/utils/watch';

interface ObjectRecord {
  schema?: JSONSchema4,
  object: string,
  key: string,
  meta: V1PartialObjectMetadata,
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
const groups = await useApisDiscovery().getGroups();
const targetGroup = ref(groups[0]);

const types = computed(() =>
  targetGroup.value.versions[0].resources.filter((r) => r.verbs.includes('list')));

const defaultTargetType = () => {
  const firstWithWatch = types.value.find(
    (v) => v.verbs.includes('watch')
  );
  return firstWithWatch ?? types.value[0] ?? null;
};

const targetType = ref(defaultTargetType());
const objects = ref(EMPTY_V1_TABLE);
const lastUpdatedAt = useLastChanged(objects, { initialValue: timestamp() });
const lastUpdated = useTimeAgo(lastUpdatedAt);
const objectsLoading = ref(false);
const tab = ref('explore');
const inspectedObjects = ref<Array<ObjectRecord>>([]);
const verbose = ref(useDisplay().xlAndUp.value);
const { smAndDown } = useDisplay();
const { appBarHeightPX } = useAppTabs();

const { abort: abortRequests, signal } = useAbortController();

const listObjects = async () => {
  abortRequests();

  if (targetType.value === null) {
    objects.value = EMPTY_V1_TABLE;
    return;
  }

  objectsLoading.value = true;
  const options = {
    group: targetGroup.value.metadata!.name,
    version: targetGroup.value.versions[0].version,
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

const preferredGroupVersion = (group: V2APIGroupDiscovery) =>
  group.metadata!.name ? `${group.metadata!.name}/${group.versions[0].version}`
  : group.versions[0].version;

const inspectObject = async (obj: V1PartialObjectMetadata) => {
  const sharedOptions = {
    group: targetGroup.value.metadata!.name,
    version: targetGroup.value.versions[0].version,
    plural: targetType.value.resource,
    name: obj.metadata!.name!,
  };
  const objectRecord: ObjectRecord = { object: '', key: uniqueKeyForObject(obj), meta: obj };
  if (obj.metadata!.namespace) {
    objectRecord.object = await (await anyApi.withPreMiddleware(asYAML)
      .getNamespacedCustomObjectRaw({
        ...sharedOptions,
        namespace: obj.metadata!.namespace!,
      })).raw.text();
  } else {
    objectRecord.object = await (await anyApi.withPreMiddleware(asYAML)
      .getClusterCustomObjectRaw(sharedOptions)).raw.text();
  }

  try {
    // XXX: if it is a custom resouce, and we are able to access crd,
    // using openAPIV3Schema may be faster
    const root = await openAPISchemaDiscovery.getSchema(sharedOptions);

    // XXX: is there a better place to place this?
    const apiBase = `/api${targetGroup.value.metadata!.name ? 's' : ''}/${preferredGroupVersion(targetGroup.value)}`;
    const path = `${apiBase}/${obj.metadata!.namespace ? 'namespaces/{namespace}/' : ''}${targetType.value!.resource}/{name}`;
    const object = (root.paths[path]?.get?.responses['200'] as OpenAPIV3.ResponseObject)
      .content?.['application/json']?.schema;

    if (!object) {
      console.log('Schema discovered, but no response definition for: ', path);
    } else {
      objectRecord.schema = openapiSchemaToJsonSchema(dereference(root, object));
    }
  } catch (e) {
    //shrug
    console.log('Schema discovery failed: ', e);
  }

  inspectedObjects.value.push(objectRecord);
  tab.value = objectRecord.key;
};

const closeTab = (idx: number) => {
  tab.value = 'explore';
  inspectedObjects.value.splice(idx, 1);
};

const nsName = (o: KubernetesObject) => {
  if (o.metadata!.namespace) {
    return `${o.metadata!.namespace}/${o.metadata!.name}`;
  } else {
    return o.metadata!.name!;
  }
}

watch(targetGroup, () => targetType.value = defaultTargetType());
watch(targetType, listObjects, { immediate: true });
watch(allNamespaces, listObjects);
watch(selectedNamespace, listObjects);
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="explore">Explore</VTab>
    <DynamicTab v-for="(obj, index) in inspectedObjects" :key="obj.key"
      :value="obj.key" :description="`${obj.meta.kind}: ${nsName(obj.meta)}`"
      :title="nsName(obj.meta)" @close="closeTab(index)" />
  </AppTabs>
  <VWindow v-model="tab" :touch="false">
    <WindowItem value="explore">
      <VRow class="mb-1" :dense="smAndDown">
        <VCol cols="6" sm="">
          <VAutocomplete label="API group" v-model="targetGroup" :items="groups"
            return-object hide-details :item-title="preferredGroupVersion" />
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
        items-per-page="-1"
        :items="objects.rows ?? []" :headers="columns" :loading="objectsLoading">
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
    <WindowItem v-for="obj in inspectedObjects" :key="obj.key" :value="obj.key">
      <YAMLViewer :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px)`"
        :data="obj.object" :schema="obj.schema" />
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
