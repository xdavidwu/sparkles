<script setup lang="ts">
import {
  VAutocomplete,
  VBtn,
  VCol,
  VDataTable,
  VDataTableRow,
  VRow,
  VSelect,
  VTab,
  VTabs,
  VWindow,
  VWindowItem,
} from 'vuetify/components';
import YAMLViewer from '@/components/YAMLViewer.vue';
import { computed, watch, ref } from 'vue';
import { computedAsync } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { useDisplay } from 'vuetify';
import { useAbortController } from '@/composables/abortController';
import { useNamespaces } from '@/stores/namespaces';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useApiConfig } from '@/stores/apiConfig';
import { useOpenAPISchemaDiscovery } from '@/stores/openAPISchemaDiscovery';
import { useErrorPresentation } from '@/stores/errorPresentation';
import type { V1APIGroup, V1APIResource } from '@/kubernetes-api/src';
import { AnyApi, type V1Table, type V1TableRow, type V1PartialObjectMetadata } from '@/utils/AnyApi';
import type { OpenAPIV3 } from 'openapi-types';
import { uniqueKeyForObject } from '@/utils/objects';
import { listAndWatchTable } from '@/utils/watch';

interface ResponseSchema {
  root: OpenAPIV3.Document,
  object: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
}

interface ObjectRecord {
  schema?: ResponseSchema,
  object: any,
}

enum Verbosity {
  FULL = 'full',
  MINIMAL = 'minimal',
}

const LOADING = '(loading)';
const NS_ALL_NAMESPACES = '(all)';
const EMPTY_V1_TABLE = {
  columnDefinitions: [],
  rows: [],
};
const apiConfigStore = useApiConfig();
const openAPISchemaDiscovery = useOpenAPISchemaDiscovery();

const { namespaces } = storeToRefs(useNamespaces());
const namespaceOptions = computed(() => [ '(all)', ...namespaces.value ]);
const targetNamespace = ref(NS_ALL_NAMESPACES);
const groups = computedAsync<Array<V1APIGroup>>(() => useApisDiscovery().getGroups(), []);
const targetGroup = ref<V1APIGroup>({
  name: '', versions: [], preferredVersion: {
    groupVersion: LOADING, version: '',
  },
});
const types = ref<Array<V1APIResource>>([]);
const targetType = ref<V1APIResource | null>({
  kind: '', name: LOADING, namespaced: false, singularName: '', verbs: [],
});
const objects = ref<V1Table>(EMPTY_V1_TABLE);
const tab = ref('explore');
const inspectedObjects = ref<Array<ObjectRecord>>([]);
const verbosity = ref(useDisplay().xlAndUp.value ? Verbosity.FULL : Verbosity.MINIMAL);

const { abort: abortRequests, signal } = useAbortController();

const getTypes = async () => {
  if (targetGroup.value.preferredVersion!.groupVersion === LOADING) {
    return;
  }
  const anyApi = new AnyApi(await apiConfigStore.getConfig());
  const response = await anyApi.getAPIResources({
    group: targetGroup.value.name,
    version: targetGroup.value.preferredVersion!.version,
  });

  // filter out subresources, unlistables
  types.value = response.resources.filter(
    (v) => (!v.name.includes('/') && v.verbs.includes('list'))
  );
  targetType.value = types.value[0] ?? null;
};

const listObjects = async () => {
  abortRequests();

  if (targetType.value === null) {
    objects.value = EMPTY_V1_TABLE;
    return;
  }

  const anyApi = new AnyApi(await apiConfigStore.getConfig());
  const sharedOptions = {
    group: targetGroup.value.name,
    version: targetGroup.value.preferredVersion!.version,
    plural: targetType.value.name,
  };
  const listNamespaced = targetType.value.namespaced && targetNamespace.value !== NS_ALL_NAMESPACES;
  if (targetType.value.verbs.includes('watch')) {
    if (listNamespaced) {
      listAndWatchTable(
        objects,
        (opt) => anyApi.listNamespacedCustomObjectAsTableRaw(opt, { signal: signal.value }),
        { ...sharedOptions, namespace: targetNamespace.value },
      ).catch((e) => useErrorPresentation().pendingError = e);
    } else {
      listAndWatchTable(
        objects,
        (opt) => anyApi.listClusterCustomObjectAsTableRaw(opt, { signal: signal.value }),
        sharedOptions,
      ).catch((e) => useErrorPresentation().pendingError = e);
    }
  } else {
    // TODO notify user table is not receiving updates
    if (listNamespaced) {
      objects.value = await anyApi.listNamespacedCustomObjectAsTable({
        ...sharedOptions,
        namespace: targetNamespace.value,
      });
    } else {
      objects.value = await anyApi.listClusterCustomObjectAsTable(sharedOptions);
    }
  }
};

const columns = computed(() =>
  ((targetType.value?.namespaced && targetNamespace.value === NS_ALL_NAMESPACES) ? [{
    title: 'Namespace',
    key: 'object.metadata.namespace',
  }] : []).concat(
    objects.value.columnDefinitions.map((c, i) => ({
      priority: c.priority,
      title: c.name,
      key: `cells.${i}`,
      headerProps: { // html title tooltip, TODO: roll our own a la YAMLViewer
        title: c.description,
      },
    })).filter((c) => verbosity.value === Verbosity.FULL || c.priority === 0)
  ),
);

const inspectObject = async (obj: V1PartialObjectMetadata) => {
  const anyApi = new AnyApi(await apiConfigStore.getConfig());
  const api = {
    group: targetGroup.value.name,
    version: targetGroup.value.preferredVersion!.version,
  };
  const sharedOptions = {
    ...api,
    plural: targetType.value!.name,
    name: obj.metadata!.name!,
  };
  let object;
  if (obj.metadata!.namespace) {
    object = await anyApi.getNamespacedCustomObject({
      ...sharedOptions,
      namespace: obj.metadata!.namespace!,
    });
  } else {
    object = await anyApi.getClusterCustomObject(sharedOptions);
  }

  const objectRecord: ObjectRecord = { object };

  try {
    const root = await openAPISchemaDiscovery.getSchema(api);

    // XXX: is there a better place to place this?
    const apiBase = targetGroup.value.name ?
      `/apis/${targetGroup.value.preferredVersion!.groupVersion}` :
      `/api/${targetGroup.value.preferredVersion!.version}`;
    const path = `${apiBase}/${obj.metadata!.namespace ? 'namespaces/{namespace}/' : ''}${targetType.value!.name}/{name}`;
    const object = (root.paths[path]?.get?.responses['200'] as OpenAPIV3.ResponseObject)
      .content?.['application/json']?.schema;

    if (!object) {
      console.log('Schema discoverd, but no response definition for: ', path);
    } else {
      objectRecord.schema = { root, object };
    }
  } catch (e) {
    //shrug
    console.log('Schema discovery failed: ', e);
  }

  inspectedObjects.value.push(objectRecord);
  tab.value = uniqueKeyForObject(object);
};

const closeTab = (idx: number) => {
  tab.value = 'explore';
  inspectedObjects.value.splice(idx, 1);
};

watch(groups, (groups) => {
  if (groups.length) {
    targetGroup.value = groups[0];
  }
}, { immediate: true });
watch(targetGroup, getTypes, { immediate: true });
watch(targetType, listObjects);
watch(targetNamespace, listObjects);
</script>

<template>
  <VTabs v-model="tab">
    <VTab value="explore">Explore</VTab>
    <VTab v-for="(obj, index) in inspectedObjects"
      :key="uniqueKeyForObject(obj.object)"
      :value="uniqueKeyForObject(obj.object)">
      <template v-if="obj.object.metadata.namespace">
        {{ obj.object.metadata.namespace }}/{{ obj.object.metadata.name }}
      </template>
      <template v-else>
        {{ obj.object.metadata.name }}
      </template>
      <VBtn size="x-small" icon="mdi-close" variant="plain" @click.stop="closeTab(index)" />
    </VTab>
  </VTabs>
  <VWindow v-model="tab">
    <VWindowItem value="explore">
      <VRow class="mb-1">
        <VCol cols="6" md="">
          <VAutocomplete label="API group" v-model="targetGroup" :items="groups"
            return-object hide-details
            :item-title="(api) => (api.preferredVersion!.groupVersion)" />
        </VCol>
        <VCol cols="6" md="">
          <VAutocomplete label="Type" v-model="targetType" :items="types"
            return-object hide-details item-title="name" />
        </VCol>
        <VCol cols="6" md="">
          <VAutocomplete v-if="targetType?.namespaced" label="Namespace"
            v-model="targetNamespace" :items="namespaceOptions" hide-details />
          <VSelect v-else label="Namespace" model-value="(global)" hide-details
            disabled />
        </VCol>
        <VCol cols="6" md="2">
          <VSelect label="Verbosity" v-model="verbosity"
            :items="Object.values(Verbosity)" hide-details />
        </VCol>
      </VRow>
      <VDataTable hover fixed-header class="data-table-auto" height="calc(100vh - 224px)"
        items-per-page="-1"
        :items="objects.rows ?? []" :headers="columns">
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
