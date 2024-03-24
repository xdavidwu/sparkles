<script setup lang="ts">
import {
  VAutocomplete,
  VCol,
  VDataTable,
  VDataTableRow,
  VRow,
  VSelect,
  VSwitch,
  VTab,
  VWindow,
  VWindowItem,
} from 'vuetify/components';
import AppTabs from '@/components/AppTabs.vue';
import DynamicTab from '@/components/DynamicTab.vue';
import YAMLViewer from '@/components/YAMLViewer.vue';
import { computed, watch, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDisplay } from 'vuetify';
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
const objectsLoading = ref(false);
const tab = ref('explore');
const inspectedObjects = ref<Array<ObjectRecord>>([]);
const verbose = ref(useDisplay().xlAndUp.value);

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
    useErrorPresentation().pendingToast =
      `${targetGroup.value.preferredVersion!.groupVersion} ${targetType.value.name}` +
      ' does not support watch, updates will not be reflected without refreshing.';
    objects.value = await anyApi[`list${listType}CustomObjectAsTable`](options);
  }
  objectsLoading.value = false;
};

const columns = computed(() =>
  ((targetType.value?.namespaced && allNamespaces.value) ? [{
    title: 'Namespace',
    key: 'object.metadata.namespace',
  }] : []).concat(
    objects.value.columnDefinitions
      .filter((c) => verbose.value || c.priority === 0)
      .map((c, i) => ({
        title: c.name,
        key: `cells.${i}`,
        headerProps: { // html title tooltip, TODO: roll our own a la YAMLViewer
          title: c.description,
        },
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
      <VRow class="mb-1">
        <VCol cols="6" md="">
          <VAutocomplete label="API group" v-model="targetGroup" :items="groups"
            return-object hide-details
            :item-title="(api) => (api.preferredVersion!.groupVersion)" />
        </VCol>
        <VCol cols="6" md="">
          <VAutocomplete label="Type" v-model="targetType" :items="types"
            return-object hide-details item-title="name" :loading="typesLoading" />
        </VCol>
        <VCol cols="6" md="3">
          <VSwitch v-if="targetType?.namespaced"
            label="All namespaces" v-model="allNamespaces" hide-details />
          <div v-else title="Selected type is not namespaced">
            <VSwitch disabled label="All namespaces" :model-value="true" hide-details />
          </div>
        </VCol>
        <VCol cols="6" md="2">
          <VSwitch label="Verbose" v-model="verbose" hide-details />
        </VCol>
      </VRow>
      <VDataTable hover fixed-header class="data-table-auto"
        items-per-page="-1"
        :items="objects.rows ?? []" :headers="columns" :loading="objectsLoading">
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
</style>
