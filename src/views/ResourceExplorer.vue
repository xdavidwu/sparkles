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
            :key="uniqueKeyForTable(row.object)"
            @click="inspectObject(row.object)">
            <td v-for="cell in row.cells" :key="cell">{{ cell }}</td>
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
import { useApiConfig } from '@/stores/apiConfig';
import { ApiregistrationV1Api, CoreV1Api, type V1APIServiceSpec } from '@/kubernetes-api/src';
import { AnyApi } from '@/utils/AnyApi';

interface Data {
  apis: V1APIServiceSpec[];
  targetAPI: V1APIServiceSpec;
  resources: [];
  targetResource: Object;
  namespaces: string[];
  targetNamespace: string;
  listing: Object;
  tab: Object;
  inspectedObjects: Object[];
}

const NS_ALL_NAMESPACES = '(all)';

export default {
  async created() {
    await this.getNamespaces();
    this.getAPIs();
    this.$watch('targetAPI', this.getResources);
    this.$watch('targetResource', this.listResources);
    this.$watch('targetNamespace', this.listResources);
  },
  data(): Data {
    return {
      apis: [],
      targetAPI: {},
      resources: [],
      targetResource: { name: '(loading)', namespaced: false },
      namespaces: [],
      targetNamespace: NS_ALL_NAMESPACES,
      listing: {
        columnDefinitions: [],
        rows: [],
      },
      tab: null,
      inspectedObjects: [],
    };
  },
  computed: {
    namespaceOptions() {
      return [NS_ALL_NAMESPACES, ...this.namespaces];
    }
  },
  methods: {
    uniqueKeyForTable(obj: Object) {
      if (obj.metadata.uid) {
        return obj.metadata.uid;
      }
      if (obj.metadata.namespace) {
        return `${obj.metadata.namespace}/${obj.metadata.name}`;
      }
      return obj.metadata.name;
    },
    uniqueKeyForInspectedObject(obj: Object) {
      if (obj.metadata.uid) {
        return obj.metadata.uid;
      }
      if (obj.metadata.namespace) {
        return `${obj.apiVersion}/${obj.kind}/${obj.metadata.namespace}/${obj.metadata.name}`;
      }
      return `${obj.apiVersion}/${obj.kind}/${obj.metadata.name}`;
    },
    async getNamespaces() {
      const apiConfig = await useApiConfig().getConfig();
      const response = await (new CoreV1Api(apiConfig)).listNamespace({});
      this.namespaces = response.items.map((i) => (i.metadata.name));
    },
    async getAPIs() {
      const apiConfig = await useApiConfig().getConfig();
      const response = await (new ApiregistrationV1Api(apiConfig)).listAPIService({});
      this.apis = response.items.map((i) => (i.spec));
      this.targetAPI = this.apis[0];
    },
    async getResources() {
      const apiConfig = await useApiConfig().getConfig();
      const api = new AnyApi(apiConfig, this.targetAPI.group, this.targetAPI.version!);
      const response = await api.getAPIResources();

      // filter out subresources, unlistables
      this.resources = response.resources.filter(
        (v) => (!v.name.includes('/') && v.verbs.includes('list'))
      );
      this.targetResource = this.resources[0];
    },
    async listResources() {
      const apiConfig = await useApiConfig().getConfig();
      const api = new AnyApi(apiConfig, this.targetAPI.group, this.targetAPI.version!);

      const namespace = (!this.targetResource.namespaced ||
        this.targetNamespace === NS_ALL_NAMESPACES) ? '' : this.targetNamespace;
      this.listing = await api.listResourcesAsTable(this.targetResource.name,
        namespace);
    },
    async inspectObject(obj: Object) {
      const apiConfig = await useApiConfig().getConfig();
      const api = new AnyApi(apiConfig, this.targetAPI.group, this.targetAPI.version!);
      const object = await api.getResource(
        this.targetResource.name, obj.metadata.name, obj.metadata.namespace
      );

      this.inspectedObjects.push(object);
      this.tab = this.uniqueKeyForInspectedObject(object);
    },
    closeTab(idx: number) {
      this.tab = 'explore';
      this.inspectedObjects.splice(idx, 1);
    },
  },
};
</script>
