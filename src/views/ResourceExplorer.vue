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
import { computed, watch, ref, onUnmounted } from 'vue';
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
const targetGroup = ref<V1APIGroup>({
  name: '', versions: [], preferredVersion: {
    groupVersion: LOADING, version: '',
  },
});
const types = ref<Array<V1APIResource>>([]);
const targetType = ref<V1APIResource>({
  kind: '', name: LOADING, namespaced: false, singularName: '', verbs: [],
});
const objects = ref<V1Table>({
  columnDefinitions: [],
  rows: [],
});
const tab = ref('explore');
const inspectedObjects = ref<Array<ObjectRecord>>([]);
const verbosity = ref('minimal');

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
  targetType.value = types.value[0];
};

let abortController: AbortController | null = null;
const listObjects = async () => {
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

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
        (opt) => anyApi.listNamespacedCustomObjectAsTableRaw(opt, { signal: abortController!.signal }),
        { ...sharedOptions, namespace: targetNamespace.value },
      ).catch((e) => useErrorPresentation().pendingError = e);
    } else {
      listAndWatchTable(
        objects,
        (opt) => anyApi.listClusterCustomObjectAsTableRaw(opt, { signal: abortController!.signal }),
        sharedOptions,
      ).catch((e) => useErrorPresentation().pendingError = e);
    }
  } else {
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

const inspectObject = async (obj: V1PartialObjectMetadata) => {
  const anyApi = new AnyApi(await apiConfigStore.getConfig());
  const api = {
    group: targetGroup.value.name,
    version: targetGroup.value.preferredVersion!.version,
  };
  const sharedOptions = {
    ...api,
    plural: targetType.value.name,
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
    const path = `${apiBase}/${obj.metadata!.namespace ? 'namespaces/{namespace}/' : ''}${targetType.value.name}/{name}`;
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

onUnmounted(() => {
  if (abortController) {
    abortController.abort();
  }
})
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
          <VAutocomplete v-if="targetType.namespaced" label="Namespace"
            v-model="targetNamespace" :items="namespaceOptions" hide-details />
          <VSelect v-else label="Namespace" model-value="(global)" hide-details
            disabled />
        </VCol>
        <VCol cols="6" md="2">
          <VSelect label="Verbosity" v-model="verbosity"
            :items="['minimal', 'full']" hide-details />
        </VCol>
      </VRow>
      <VTable hover fixed-header height="calc(100vh - 224px)"
        :class="{ 'show-all': verbosity === 'full' }">
        <thead>
          <tr>
            <th v-if="targetType.namespaced && targetNamespace === NS_ALL_NAMESPACES">Namespace</th>
            <th v-for="column in objects.columnDefinitions" :key="column.name"
              :class="{ 'low-priority': column.priority > 0 }"
              :title="column.description">{{ column.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in objects.rows"
            :key="uniqueKeyForObject(row.object as V1PartialObjectMetadata)"
            @click="inspectObject(row.object as V1PartialObjectMetadata)"
            style="cursor: pointer">
            <td v-if="targetType.namespaced && targetNamespace === NS_ALL_NAMESPACES">
              {{ (row.object as V1PartialObjectMetadata).metadata!.namespace }}
            </td>
            <td v-for="(cell, index) in row.cells" :key="String(cell)"
              :class="{ 'low-priority': objects.columnDefinitions[index].priority > 0 }"
              >{{ cell }}</td>
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

<style scoped>
.low-priority {
  display: none;
}

.show-all .low-priority {
  display: table-cell;
}
</style>
