<script setup lang="ts">
import { VSelect, VTextField, VBtn } from 'vuetify/components';
</script>

<template>
  <VSelect label="Authentication method" v-model="scheme" :items="schemes"
    item-value="1" item-title="0" />
  <VTextField label="Bearer token" v-model="token" />
  <VBtn @click="apply">Apply</VBtn>
  <div>{{ result }}</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';

interface Data {
  token: string,
  schemes: Array<[string, string | AuthScheme]>,
  scheme: AuthScheme,
  result: string,
}

const configStore = useApiConfig();

export default defineComponent({
  data(): Data {
    return {
      token: configStore.getAccessToken(),
      schemes: Object.entries(AuthScheme).filter((i) => isNaN(Number(i[0]))),
      scheme: configStore.getAuthScheme(),
      result: '',
    };
  },
  methods: {
    apply() {
      configStore.setAuthScheme(this.scheme);
      configStore.setAccessToken(this.token);
      window.location.reload();
    },
  },
});
</script>
