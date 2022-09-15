<template>
  <label for="token">Bearer Token:</label>
  <input type="text" id="token" v-model="token">
  <button @click="setToken">Set Token</button>
  <div>{{ result }}</div>
</template>

<script lang="ts">
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@/kubernetes-api/src';

interface Data {
  token: string;
}

export default {
  data(): Data {
    return { token: '', result: '' };
  },
  methods: {
    setToken() {
      const apiConfig = useApiConfig();
      apiConfig.setAccessToken(this.token);
      (new CoreV1Api(apiConfig.getConfig())).listNamespace('').then(
        (response) => {
          this.result = response.items.map((item) => {
            return item.metadata.name;
          }).join(' ');
        },
      );
    },
  },
};
</script>
