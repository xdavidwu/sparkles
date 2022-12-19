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
</script>

<template>
  <VTabs v-model="tab">
    <VTab value="explore">Explore</VTab>
    <VTab v-for="obj in inspectedObjects"
      :key="uniqueKeyForInspectedObject(obj)"
      :value="uniqueKeyForInspectedObject(obj)">
      <template v-if="obj.metadata.namespace">
        {{ obj.metadata.namespace }}/{{ obj.metadata.name }}
      </template>
      <template v-else>
        {{ obj.metadata.name }}
      </template>
    </VTab>
  </VTabs>
  <VWindow v-model="tab">
    <VWindowItem value="explore">
      <VRow>
        <VCol>
          <VAutocomplete label="API group" v-model="targetAPI" :items="apis"
            return-object
            :item-title="(api) => (api.group ?? 'core') + '/' + api.version" />
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
      <VTable>
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
      :key="uniqueKeyForInspectedObject(obj)"
      :value="uniqueKeyForInspectedObject(obj)">
      <YAMLViewer :data="obj" />
      <VBtn @click="closeTab(idx)">Close</VBtn>
    </VWindowItem>
  </VWindow>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { useNamespaces } from '@/stores/namespaces';
import {
  ApiregistrationV1Api,
  type V1APIResource,
  type V1APIServiceSpec,
} from '@/kubernetes-api/src';
import { AnyApi, type V1Table, type V1PartialObjectMetadata } from '@/utils/AnyApi';

interface Data {
  apis: V1APIServiceSpec[];
  targetAPI: V1APIServiceSpec;
  resources: V1APIResource[];
  targetResource: V1APIResource;
  namespaces: Array<string>;
  targetNamespace: string;
  listing: V1Table;
  tab: string;
  inspectedObjects: Array<any>;
}

const NS_ALL_NAMESPACES = '(all)';
const apiConfig = await useApiConfig().getConfig();
const anyApi = new AnyApi(apiConfig);
const apiRegistrationApi = new ApiregistrationV1Api(apiConfig);

export default defineComponent({
  async created() {
    this.namespaces = await useNamespaces().getNamespaces();
    this.getAPIs();
    this.$watch('targetAPI', this.getResources);
    this.$watch('targetResource', this.listResources);
    this.$watch('targetNamespace', this.listResources);
  },
  data(): Data {
    return {
      apis: [],
      targetAPI: { groupPriorityMinimum: 0, versionPriority: 0 },
      resources: [],
      targetResource: { kind: '(loading)', name: '(loading)', namespaced: false, singularName: '(loading)', verbs: [] },
      namespaces: [],
      targetNamespace: NS_ALL_NAMESPACES,
      listing: {
        columnDefinitions: [],
        rows: [],
      },
      tab: 'explore',
      inspectedObjects: [],
    };
  },
  computed: {
    namespaceOptions() {
      return [NS_ALL_NAMESPACES, ...this.namespaces];
    }
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
    async getAPIs() {
      const response = await apiRegistrationApi.listAPIService({});
      this.apis = response.items.map((i) => (i.spec!));
      this.targetAPI = this.apis[0];
    },
    async getResources() {
      const response = await anyApi.getAPIResources({
        group: this.targetAPI.group!,
        version: this.targetAPI.version!,
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
          group: this.targetAPI.group!,
          version: this.targetAPI.version!,
          plural: this.targetResource.name,
          namespace: this.targetNamespace,
        });
      } else {
        this.listing = await anyApi.listClusterCustomObjectAsTable({
          group: this.targetAPI.group!,
          version: this.targetAPI.version!,
          plural: this.targetResource.name,
        });
      }
    },
    async inspectObject(obj: V1PartialObjectMetadata) {
      let object;
      if (obj.metadata!.namespace) {
        object = await anyApi.getNamespacedCustomObject({
          group: this.targetAPI.group!,
          version: this.targetAPI.version!,
          plural: this.targetResource.name,
          namespace: obj.metadata!.namespace!,
          name: obj.metadata!.name!,
        });
      } else {
        object = await anyApi.getClusterCustomObject({
          group: this.targetAPI.group!,
          version: this.targetAPI.version!,
          plural: this.targetResource.name,
          name: obj.metadata!.name!,
        });
      }

      this.inspectedObjects.push(object);
      this.tab = this.uniqueKeyForInspectedObject(object);
    },
    closeTab(idx: number) {
      this.tab = 'explore';
      this.inspectedObjects.splice(idx, 1);
    },
  },
});
</script>
