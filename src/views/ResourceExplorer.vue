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
import { storeToRefs } from 'pinia';
import type { V1APIGroup } from '@/kubernetes-api/src';

const { namespaces } = storeToRefs(useNamespaces());
const namespaceOptions = computed(() => [ '(all)', ...namespaces.value ]);

const { groups } = storeToRefs(useApisDiscovery());
const targetAPI = ref<V1APIGroup>({ name: '', versions: [], preferredVersion: { groupVersion: '(loading)', version: '' } });

watch(groups, (groups) => {
  if (groups.length) {
    targetAPI.value = groups[0];
  }
}, { immediate: true });
</script>

<template>
  <VTabs v-model="tab">
    <VTab value="explore">Explore</VTab>
    <VTab v-for="obj in inspectedObjects"
      :key="uniqueKeyForInspectedObject(obj.object)"
      :value="uniqueKeyForInspectedObject(obj.object)">
      <template v-if="obj.object.metadata.namespace">
        {{ obj.object.metadata.namespace }}/{{ obj.object.metadata.name }}
      </template>
      <template v-else>
        {{ obj.object.metadata.name }}
      </template>
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
      <VTable hover>
        <thead>
          <tr>
            <th v-for="column in listing.columnDefinitions" :key="column.name"
              :title="column.description">{{ column.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in listing.rows"
            :key="uniqueKeyForTable(row.object as V1PartialObjectMetadata)"
            @click="inspectObject(row.object as V1PartialObjectMetadata)"
            style="cursor: pointer">
            <td v-for="cell in row.cells" :key="String(cell)">{{ cell }}</td>
          </tr>
        </tbody>
      </VTable>
    </VWindowItem>
    <VWindowItem v-for="(obj, idx) in inspectedObjects"
      :key="uniqueKeyForInspectedObject(obj.object)"
      :value="uniqueKeyForInspectedObject(obj.object)">
      <YAMLViewer :data="obj.object" :schema="obj.schema" />
      <VBtn @click="closeTab(idx)">Close</VBtn>
    </VWindowItem>
  </VWindow>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import type { V1APIResource } from '@/kubernetes-api/src';
import { AnyApi, type V1Table, type V1PartialObjectMetadata } from '@/utils/AnyApi';
import type { OpenAPIV3 } from 'openapi-types';

type ResponseSchema = {
  root: OpenAPIV3.Document,
  object: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
};

type ObjectRecord = {
  schema?: ResponseSchema,
  object: any,
};

interface Data {
  targetAPI: V1APIGroup,
  resources: Array<V1APIResource>;
  targetResource: V1APIResource;
  targetNamespace: string;
  listing: V1Table;
  tab: string;
  inspectedObjects: Array<ObjectRecord>;
}

const apiConfig = await useApiConfig().getConfig();
const anyApi = new AnyApi(apiConfig);
const NS_ALL_NAMESPACES = '(all)';

export default defineComponent({
  async created() {
    this.$watch('targetAPI', this.getResources);
    this.$watch('targetResource', this.listResources);
    this.$watch('targetNamespace', this.listResources);
  },
  data(): Data {
    return {
      targetAPI: { name: '', versions: [], preferredVersion: { groupVersion: '(loading)', version: '' } },
      resources: [],
      targetResource: { kind: '(loading)', name: '(loading)', namespaced: false, singularName: '(loading)', verbs: [] },
      targetNamespace: NS_ALL_NAMESPACES,
      listing: {
        columnDefinitions: [],
        rows: [],
      },
      tab: 'explore',
      inspectedObjects: [],
    };
  },
  methods: {
    uniqueKeyForTable(obj: V1PartialObjectMetadata) {
      if (obj.metadata!.uid) {
        return obj.metadata!.uid;
      }
      if (obj.metadata!.namespace) {
        return `${obj.metadata!.namespace}/${obj.metadata!.name}`;
      }
      return obj.metadata!.name;
    },
    uniqueKeyForInspectedObject(obj: any) {
      if (obj.metadata.uid) {
        return obj.metadata.uid;
      }
      if (obj.metadata.namespace) {
        return `${obj.apiVersion}/${obj.kind}/${obj.metadata.namespace}/${obj.metadata.name}`;
      }
      return `${obj.apiVersion}/${obj.kind}/${obj.metadata.name}`;
    },
    async getResources() {
      const response = await anyApi.getAPIResources({
        group: this.targetAPI.name,
        version: this.targetAPI.preferredVersion!.version,
      });

      // filter out subresources, unlistables
      this.resources = response.resources.filter(
        (v) => (!v.name.includes('/') && v.verbs.includes('list'))
      );
      this.targetResource = this.resources[0];
    },
    async listResources() {
      if (this.targetResource.namespaced && this.targetNamespace !== NS_ALL_NAMESPACES) {
        this.listing = await anyApi.listNamespacedCustomObjectAsTable({
          group: this.targetAPI.name,
          version: this.targetAPI.preferredVersion!.version,
          plural: this.targetResource.name,
          namespace: this.targetNamespace,
        });
      } else {
        this.listing = await anyApi.listClusterCustomObjectAsTable({
          group: this.targetAPI.name,
          version: this.targetAPI.preferredVersion!.version,
          plural: this.targetResource.name,
        });
      }
    },
    async inspectObject(obj: V1PartialObjectMetadata) {
      let object;
      if (obj.metadata!.namespace) {
        object = await anyApi.getNamespacedCustomObject({
          group: this.targetAPI.name,
          version: this.targetAPI.preferredVersion!.version,
          plural: this.targetResource.name,
          namespace: obj.metadata!.namespace!,
          name: obj.metadata!.name!,
        });
      } else {
        object = await anyApi.getClusterCustomObject({
          group: this.targetAPI.name,
          version: this.targetAPI.preferredVersion!.version,
          plural: this.targetResource.name,
          name: obj.metadata!.name!,
        });
      }

      const objectRecord: ObjectRecord = { object };

      try {
        // XXX: schema is heavy, better make it async after moving to store
        const root = await anyApi.getOpenAPISchema({
          group: this.targetAPI.name,
          version: this.targetAPI.preferredVersion!.version,
        });

        // XXX: is there a better place to place this?
        const apiBase = this.targetAPI.name ?
          `/apis/${this.targetAPI.name}/${this.targetAPI.preferredVersion!.version}` :
          `/api/${this.targetAPI.preferredVersion!.version}`;
        const path = `${apiBase}/${obj.metadata!.namespace ? 'namespaces/{namespace}/' : ''}${this.targetResource.name}/{name}`;
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

      this.inspectedObjects.push(objectRecord);
      this.tab = this.uniqueKeyForInspectedObject(object);
    },
    closeTab(idx: number) {
      this.tab = 'explore';
      this.inspectedObjects.splice(idx, 1);
    },
  },
});
</script>
