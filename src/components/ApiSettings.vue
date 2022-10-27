<script setup lang="ts">
import { VSelect, VTextField, VBtn } from 'vuetify/components';
</script>

<template>
  <VSelect label="Authentication method" v-model="scheme" @update:modelValue="storeScheme"
    :items="schemes" item-value="1" item-title="0" />
  <VTextField label="Bearer token" v-model="token" @update:modelValue="storeToken" />
  <VBtn @click="testConnection">Test connection</VBtn>
  <div>{{ result }}</div>
</template>

<script lang="ts">
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';
import { checkPermission } from '@/utils/permission';

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
      this.result = `May list namespaces: ${await checkPermission('namespace', 'list')}`;
    },
  },
};
</script>
