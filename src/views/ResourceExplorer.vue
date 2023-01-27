<script setup lang="ts">
import {
  VAutocomplete,
  VBtn,
  VCol,
  VRow,
  VSelect,
  VTable,
  VTab,
  VTabs,
  VWindow,
  VWindowItem,
} from 'vuetify/components';
import YAMLViewer from '@/components/YAMLViewer.vue';
import { computed, watch, ref } from 'vue';
import { useNamespaces } from '@/stores/namespaces';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useApiConfig } from '@/stores/apiConfig';
import { useOpenAPISchemaDiscovery } from '@/stores/openAPISchemaDiscovery';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { storeToRefs } from 'pinia';
import type { V1APIGroup, V1APIResource } from '@/kubernetes-api/src';
import { AnyApi, type V1Table, type V1PartialObjectMetadata } from '@/utils/AnyApi';
import type { OpenAPIV3 } from 'openapi-types';
import { uniqueKeyForObject } from '@/utils/objects';
import { listAndWatchTable } from '@/utils/watch';

type ResponseSchema = {
  root: OpenAPIV3.Document,
  object: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
};

type ObjectRecord = {
  schema?: ResponseSchema,
  object: any,
};

const LOADING = '(loading)';
const NS_ALL_NAMESPACES = '(all)';
const apiConfigStore = useApiConfig();
const openAPISchemaDiscovery = useOpenAPISchemaDiscovery();

const { namespaces } = storeToRefs(useNamespaces());
const namespaceOptions = computed(() => [ '(all)', ...namespaces.value ]);
const targetNamespace = ref(NS_ALL_NAMESPACES);
const { groups } = storeToRefs(useApisDiscovery());
const targetAPI = ref<V1APIGroup>({
  name: '', versions: [], preferredVersion: {
    groupVersion: LOADING, version: '',
  },
});
const resources = ref<Array<V1APIResource>>([]);
const targetResource = ref<V1APIResource>({
  kind: '', name: LOADING, namespaced: false, singularName: '', verbs: [],
});
const listing = ref<V1Table>({
  columnDefinitions: [],
  rows: [],
});
const tab = ref('explore');
const inspectedObjects = ref<Array<ObjectRecord>>([]);

const getResources = async () => {
  if (targetAPI.value.preferredVersion!.groupVersion === LOADING) {
    return;
  }
  const anyApi = new AnyApi(await apiConfigStore.getConfig());
  const response = await anyApi.getAPIResources({
    group: targetAPI.value.name,
    version: targetAPI.value.preferredVersion!.version,
  });

  // filter out subresources, unlistables
  resources.value = response.resources.filter(
    (v) => (!v.name.includes('/') && v.verbs.includes('list'))
  );
  targetResource.value = resources.value[0];
};

let abortController: AbortController | null = null;
const listResources = async () => {
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  const anyApi = new AnyApi(await apiConfigStore.getConfig());
  const sharedOptions = {
    group: targetAPI.value.name,
    version: targetAPI.value.preferredVersion!.version,
    plural: targetResource.value.name,
  };
  const listNamespaced = targetResource.value.namespaced && targetNamespace.value !== NS_ALL_NAMESPACES;
  if (targetResource.value.verbs.includes('watch')) {
    if (listNamespaced) {
      listAndWatchTable(
        listing,
        (opt) => anyApi.listNamespacedCustomObjectAsTableRaw(opt, { signal: abortController!.signal }),
        { ...sharedOptions, namespace: targetNamespace.value },
      ).catch((e) => useErrorPresentation().pendingError = e);
    } else {
      listAndWatchTable(
        listing,
        (opt) => anyApi.listClusterCustomObjectAsTableRaw(opt, { signal: abortController!.signal }),
        sharedOptions,
      ).catch((e) => useErrorPresentation().pendingError = e);
    }
  } else {
    if (listNamespaced) {
      listing.value = await anyApi.listNamespacedCustomObjectAsTable({
        ...sharedOptions,
        namespace: targetNamespace.value,
      });
    } else {
      listing.value = await anyApi.listClusterCustomObjectAsTable(sharedOptions);
    }
  }
};

const inspectObject = async (obj: V1PartialObjectMetadata) => {
  const anyApi = new AnyApi(await apiConfigStore.getConfig());
  const api = {
    group: targetAPI.value.name,
    version: targetAPI.value.preferredVersion!.version,
  };
  const sharedOptions = {
    ...api,
    plural: targetResource.value.name,
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
    const apiBase = targetAPI.value.name ?
      `/apis/${targetAPI.value.preferredVersion!.groupVersion}` :
      `/api/${targetAPI.value.preferredVersion!.version}`;
    const path = `${apiBase}/${obj.metadata!.namespace ? 'namespaces/{namespace}/' : ''}${targetResource.value.name}/{name}`;
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
    targetAPI.value = groups[0];
  }
}, { immediate: true });
watch(targetAPI, getResources, { immediate: true });
watch(targetResource, listResources);
watch(targetNamespace, listResources);
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
      <VRow>
        <VCol>
          <VAutocomplete label="API group" v-model="targetAPI" :items="groups"
            return-object
            :item-title="(api) => (api.preferredVersion!.groupVersion)" />
        </VCol>
        <VCol>
          <VAutocomplete label="Kind" v-model="targetResource" :items="resources"
            return-object item-title="name" />
        </VCol>
        <VCol>
          <VAutocomplete v-if="targetResource.namespaced" label="Namespace"
            v-model="targetNamespace" :items="namespaceOptions" />
          <VSelect v-else label="Namespace" model-value="(global)" disabled />
        </VCol>
      </VRow>
      <VTable hover fixed-header height="calc(100vh - 224px)">
        <thead>
          <tr>
            <th v-for="column in listing.columnDefinitions" :key="column.name"
              :title="column.description">{{ column.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in listing.rows"
            :key="uniqueKeyForObject(row.object as V1PartialObjectMetadata)"
            @click="inspectObject(row.object as V1PartialObjectMetadata)"
            style="cursor: pointer">
            <td v-for="cell in row.cells" :key="String(cell)">{{ cell }}</td>
          </tr>
        </tbody>
      </VTable>
    </VWindowItem>
    <VWindowItem v-for="obj in inspectedObjects"
      :key="uniqueKeyForObject(obj.object)"
      :value="uniqueKeyForObject(obj.object)">
      <YAMLViewer :data="obj.object" :schema="obj.schema" />
    </VWindowItem>
  </VWindow>
</template>
