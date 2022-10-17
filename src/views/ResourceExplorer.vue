<template>
  <div>
    <select>
      <option v-for="api in apis">
        {{ (api.group ?? 'core') + '/' + api.version }}
      </option>
    </select>
  </div>
</template>

<script lang="ts">
import { useApiConfig } from '@/stores/apiConfig';
import { ApiregistrationV1Api } from '@/kubernetes-api/src';

interface Data {
  apis: []; //TODO type this
}

export default {
  async created() {
    this.getAPIs();
  },
  data(): Data {
    return { apis: [] };
  },
  methods: {
    async getAPIs() {
      const apiConfig = useApiConfig();
      const response = await (new ApiregistrationV1Api(await apiConfig.getConfig())).listAPIService({});
      this.apis = response.items.map((i) => (i.spec));
    },
  },
};
</script>
