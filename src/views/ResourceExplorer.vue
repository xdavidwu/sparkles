<template>
  <div>
    <select v-model="targetAPIIndex">
      <option v-for="(api, index) in apis" :key="api.group + api.version" :value="index">
        {{ (api.group ?? 'core') + '/' + api.version }}
      </option>
    </select>
    <select v-model="targetResource">
      <option v-for="resource in resources" :key="resource.name" :value="resource.name">
        {{ resource.name }}
      </option>
    </select>
    <table>
      <tr>
        <th v-for="column in listing.columnDefinitions" :key="column.name"
          :title="column.description">{{ column.name }}</th>
      </tr>
      <tr v-for="row in listing.rows" :key="row.object.metadata.name">
        <td v-for="cell in row.cells" :key="cell">{{ cell }}</td>
      </tr>
    </table>
  </div>
</template>

<script lang="ts">
import { useApiConfig } from '@/stores/apiConfig';
import { ApiregistrationV1Api } from '@/kubernetes-api/src';
import { AnyApi } from '@/utils/AnyApi';

interface Data {
  apis: []; //TODO type these
  targetAPIIndex: number;
  resources: [];
  targetResource: string;
  listing: Object;
}

export default {
  async created() {
    this.getAPIs();
    this.$watch('targetAPIIndex', this.getResources);
    this.$watch('targetResource', this.listResources);
  },
  data(): Data {
    return {
      apis: [],
      targetAPIIndex: -1,
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
      this.targetAPIIndex = 0;
    },
    async getResources() {
      const apiSpec = this.apis[this.targetAPIIndex];
      const apiConfig = await useApiConfig().getConfig();
      const api = new AnyApi(apiConfig, apiSpec.group, apiSpec.version);
      const response = await api.getAPIResources();

      // filter out subresources, unlistables
      this.resources = response.resources.filter(
        (v) => (!v.name.includes('/') && v.verbs.includes('list')));
      console.log(this.resources);
      this.targetResource = this.resources[0].name;
    },
    async listResources() {
      const apiSpec = this.apis[this.targetAPIIndex];
      const apiConfig = await useApiConfig().getConfig();
      const api = new AnyApi(apiConfig, apiSpec.group, apiSpec.version);

      this.listing = await api.listResourcesAsTable(this.targetResource);
    },
  },
};
</script>
