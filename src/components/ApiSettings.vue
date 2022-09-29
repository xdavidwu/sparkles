<template>
  <div>
    <label for="scheme">Authentication method:</label>
    <select id="scheme" v-model="scheme" @change="storeScheme">
      <option v-for="scheme in schemes" :key="scheme" :value="scheme[1]">
        {{ scheme[0] }}
      </option>
    </select>
  </div>
  <div>
    <label for="token">Bearer token:</label>
    <input type="text" id="token" v-model="token" @input="storeToken">
  </div>
  <button @click="testConnection">Test connection</button>
  <div>{{ result }}</div>
</template>

<script lang="ts">
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';
import { CoreV1Api } from '@/kubernetes-api/src';

interface Data {
  token: string,
  schemes: string[][],
  scheme: AuthScheme,
  result: string,
}

export default {
  data(): Data {
    return {
      token: useApiConfig().getAccessToken(),
      schemes: Object.entries(AuthScheme).filter((i) => isNaN(Number(i[0]))),
      scheme: useApiConfig().getAuthScheme(),
      result: '',
    };
  },
  methods: {
    storeScheme() {
      const apiConfig = useApiConfig();
      apiConfig.setAuthScheme(this.scheme);
    },
    storeToken() {
      const apiConfig = useApiConfig();
      apiConfig.setAccessToken(this.token);
    },
    async testConnection() {
      const apiConfig = useApiConfig();
      const response = await (new CoreV1Api(await apiConfig.getConfig())).listNamespace('');
      this.result = response.items.map((item) => {
        return item.metadata.name;
      }).join(' ');
    },
  },
};
</script>
