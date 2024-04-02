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
  VWindowItem,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import YAMLViewer from '@/components/YAMLViewer.vue';
import { computed, watch, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDisplay } from 'vuetify';
import { timestamp, useLastChanged, useTimeAgo } from '@vueuse/core';
import { useAbortController } from '@/composables/abortController';
import { useNamespaces } from '@/stores/namespaces';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useApiConfig } from '@/stores/apiConfig';
import { useOpenAPISchemaDiscovery } from '@/stores/openAPISchemaDiscovery';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { AnyApi, type V1Table, type V1PartialObjectMetadata } from '@/utils/AnyApi';
import type { OpenAPIV3 } from 'openapi-types';
import { uniqueKeyForObject, type KubernetesObject } from '@/utils/objects';
import { listAndUnwaitedWatchTable } from '@/utils/watch';

interface ResponseSchema {
  root: OpenAPIV3.Document,
  object: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
}

interface ObjectRecord {
  schema?: ResponseSchema,
  object: KubernetesObject,
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

const typesLoading = ref(false);
const getTypes = async () => {
  typesLoading.value = true;
  const response = await anyApi.getAPIResources({
    group: targetGroup.value.name,
    version: targetGroup.value.preferredVersion!.version,
  });
  typesLoading.value = false;

  // filter out subresources, unlistables
  return response.resources.filter(
    (v) => (!v.name.includes('/') && v.verbs.includes('list'))
  );
};
const types = ref(await getTypes());

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

const { abort: abortRequests, signal } = useAbortController();

const listObjects = async () => {
  abortRequests();

  if (targetType.value === null) {
    objects.value = EMPTY_V1_TABLE;
    return;
  }

  objectsLoading.value = true;
  const options = {
    group: targetGroup.value.name,
    version: targetGroup.value.preferredVersion!.version,
    plural: targetType.value.name,
    namespace: selectedNamespace.value,
  };
  const listType = (targetType.value.namespaced && !allNamespaces.value) ?
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
  ((targetType.value?.namespaced && allNamespaces.value) ? [{
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
  const sharedOptions = {
    group: targetGroup.value.name,
    version: targetGroup.value.preferredVersion!.version,
    plural: targetType.value!.name,
    name: obj.metadata!.name!,
  };
  const objectRecord: ObjectRecord = { object: {} };
  if (obj.metadata!.namespace) {
    objectRecord.object = await anyApi.getNamespacedCustomObject({
      ...sharedOptions,
      namespace: obj.metadata!.namespace!,
    });
  } else {
    objectRecord.object = await anyApi.getClusterCustomObject(sharedOptions);
  }

  try {
    const root = await openAPISchemaDiscovery.getSchema(sharedOptions);

    // XXX: is there a better place to place this?
    const apiBase = targetGroup.value.name ?
      `/apis/${targetGroup.value.preferredVersion!.groupVersion}` :
      `/api/${targetGroup.value.preferredVersion!.version}`;
    const path = `${apiBase}/${obj.metadata!.namespace ? 'namespaces/{namespace}/' : ''}${targetType.value!.name}/{name}`;
    const object = (root.paths[path]?.get?.responses['200'] as OpenAPIV3.ResponseObject)
      .content?.['application/json']?.schema;

    if (!object) {
      console.log('Schema discovered, but no response definition for: ', path);
    } else {
      objectRecord.schema = { root, object };
    }
  } catch (e) {
    //shrug
    console.log('Schema discovery failed: ', e);
  }

  inspectedObjects.value.push(objectRecord);
  tab.value = uniqueKeyForObject(objectRecord.object);
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

watch(targetGroup, async () => {
  types.value = await getTypes();
  targetType.value = defaultTargetType();
});
watch(targetType, listObjects, { immediate: true });
watch(allNamespaces, listObjects);
watch(selectedNamespace, listObjects);
</script>

<template>
  <AppTabs v-model="tab">
    <VTab value="explore">Explore</VTab>
    <DynamicTab v-for="(obj, index) in inspectedObjects"
      :key="uniqueKeyForObject(obj.object)"
      :value="uniqueKeyForObject(obj.object)"
      :description="`${obj.object.kind}: ${nsName(obj.object)}`"
      :title="nsName(obj.object)"
      @close="closeTab(index)" />
  </AppTabs>
  <VWindow v-model="tab" :touch="false">
    <VWindowItem value="explore">
      <VRow class="mb-1" :dense="smAndDown">
        <VCol cols="6" sm="">
          <VAutocomplete label="API group" v-model="targetGroup" :items="groups"
            return-object hide-details
            :item-title="(api) => (api.preferredVersion!.groupVersion)" />
        </VCol>
        <VCol cols="6" sm="">
          <VAutocomplete label="Type" v-model="targetType" :items="types"
            return-object hide-details item-title="kind" :loading="typesLoading" />
        </VCol>
        <VCol md="3" sm="4">
          <VCheckbox v-if="targetType?.namespaced" class="checkbox-intense"
            label="All namespaces" v-model="allNamespaces" hide-details
            density="compact" />
          <div v-else title="Selected type is not namespaced">
            <VCheckbox class="checkbox-intense" disabled label="All namespaces"
              :model-value="true" hide-details density="compact" />
          </div>
          <VCheckbox class="checkbox-intense" label="Verbose" v-model="verbose"
            hide-details density="compact" />
        </VCol>
      </VRow>
      <div v-if="!targetType.verbs.includes('watch')"
        class="text-caption text-medium-emphasis mb-2">
        This type does not support watch operation, last updated
        <span :title="new Date(lastUpdatedAt).toLocaleString()"
          class="font-weight-bold">{{ lastUpdated }}</span>
        <VBtn variant="text" size="x-small" color="primary" @click="listObjects">refresh</VBtn>
      </div>
      <VDataTable hover fixed-header class="data-table-auto"
        items-per-page="-1"
        :items="objects.rows ?? []" :headers="columns" :loading="objectsLoading">
        <!-- TODO: ask vuetify to open up VDataTableHeaderCell -->
        <template v-for="(c, i) in columns" #[`header.${c.key}`]="{ column, getSortIcon }" :key="i">
          <div class="v-data-table-header__content h-100">
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
    </VWindowItem>
    <VWindowItem v-for="obj in inspectedObjects"
      :key="uniqueKeyForObject(obj.object)"
      :value="uniqueKeyForObject(obj.object)">
      <YAMLViewer :data="obj.object" :schema="obj.schema" />
    </VWindowItem>
  </VWindow>
</template>

<style>
.data-table-auto table {
  table-layout: auto !important;
}

.checkbox-intense > .v-input__control > .v-selection-control {
  min-height: unset !important;
}
</style>
