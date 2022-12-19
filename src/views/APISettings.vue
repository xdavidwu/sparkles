<script setup lang="ts">
import { VSelect, VTextField, VBtn } from 'vuetify/components';
</script>

<template>
  <VSelect label="Authentication method" v-model="scheme" :items="schemes"
    item-value="1" item-title="0" />
  <VTextField v-if="scheme === AuthScheme.AccessToken" label="Bearer token"
    v-model="token" />
  <VBtn @click="apply">Apply</VBtn>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';

interface Data {
  token: string,
  schemes: Array<[string, string | AuthScheme]>,
  scheme: AuthScheme,
}

const configStore = useApiConfig();

export default defineComponent({
  data(): Data {
    return {
      token: configStore.accessToken,
      schemes: Object.entries(AuthScheme).filter((i) => isNaN(Number(i[0]))),
      scheme: configStore.authScheme,
    };
  },
  methods: {
    apply() {
      configStore.$patch({
        authScheme: this.scheme,
        accessToken: this.token,
      });
      window.location.reload();
    },
  },
});
</script>
