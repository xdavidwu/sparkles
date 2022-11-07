<script setup lang="ts">
import { VAutocomplete, VRow, VCol, VTable } from 'vuetify/components';
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
        <VAutocomplete label="Kind" v-model="targetResource" :items="resources" />
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
import { ApiregistrationV1Api } from '@/kubernetes-api/src';
import { AnyApi } from '@/utils/AnyApi';

interface Data {
  apis: []; //TODO type these
  targetAPI: Object;
  resources: [];
  targetResource: string;
  listing: Object;
}

export default {
  async created() {
    this.getAPIs();
    this.$watch('targetAPI', this.getResources);
    this.$watch('targetResource', this.listResources);
  },
  data(): Data {
    return {
      apis: [],
      targetAPI: {},
      resources: [],
      targetResource: null,
      listing: {
        columnDefinitions: [],
        rows: [],
      },
    };
  },
  methods: {
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
      ).map((v) => v.name);
      console.log(this.resources);
      this.targetResource = this.resources[0];
    },
    async listResources() {
      const apiConfig = await useApiConfig().getConfig();
      const api = new AnyApi(apiConfig, this.targetAPI.group, this.targetAPI.version);

      this.listing = await api.listResourcesAsTable(this.targetResource);
    },
  },
};
</script>
