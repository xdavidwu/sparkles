<script setup lang="ts">
import { VAutocomplete, VSelect, VRow, VCol, VTable } from 'vuetify/components';
</script>

<template>
  <div>
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
          :key="`${row.object.metadata.namespace}/${row.object.metadata.name}`">
          <td v-for="cell in row.cells" :key="cell">{{ cell }}</td>
        </tr>
      </tbody>
    </VTable>
  </div>
</template>

<script lang="ts">
import { useApiConfig } from '@/stores/apiConfig';
import { ApiregistrationV1Api, CoreV1Api } from '@/kubernetes-api/src';
import { AnyApi } from '@/utils/AnyApi';

interface Data {
  apis: []; //TODO type these
  targetAPI: Object;
  resources: [];
  targetResource: Object;
  namespaces: string[];
  targetNamespace: string;
  listing: Object;
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
    };
  },
  computed: {
    namespaceOptions() {
      return [NS_ALL_NAMESPACES, ...this.namespaces];
    }
  },
  methods: {
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
      const api = new AnyApi(apiConfig, this.targetAPI.group, this.targetAPI.version);
      const response = await api.getAPIResources();

      // filter out subresources, unlistables
      this.resources = response.resources.filter(
        (v) => (!v.name.includes('/') && v.verbs.includes('list'))
      );
      this.targetResource = this.resources[0];
    },
    async listResources() {
      const apiConfig = await useApiConfig().getConfig();
      const api = new AnyApi(apiConfig, this.targetAPI.group, this.targetAPI.version);

      const namespace = (!this.targetResource.namespaced ||
        this.targetNamespace === NS_ALL_NAMESPACES) ? '' : this.targetNamespace;
      this.listing = await api.listResourcesAsTable(this.targetResource.name,
        namespace);
    },
  },
};
</script>
