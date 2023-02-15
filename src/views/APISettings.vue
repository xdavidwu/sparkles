<script setup lang="ts">
import { VSelect, VTextField, VBtn } from 'vuetify/components';
import { ref } from 'vue';
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';

const configStore = useApiConfig();

const schemes = Object.entries(AuthScheme).filter((i) => isNaN(Number(i[0])));
const scheme = ref(configStore.authScheme);
const token = ref(configStore.accessToken);
const impersonateUser = ref(configStore.impersonation.asUser);
const impersonateGroup = ref(configStore.impersonation.asGroup);

const apply = () => {
  configStore.$patch({
    authScheme: scheme.value,
    accessToken: token.value,
    impersonation: {
      asUser: impersonateUser.value,
      asGroup: impersonateGroup.value,
    },
  });
  window.location.reload();
};
</script>

<template>
  <VSelect label="Authentication method" v-model="scheme" :items="schemes"
    item-value="1" item-title="0" />
  <VTextField v-if="scheme === AuthScheme.AccessToken" label="Bearer token"
    v-model="token" />
  <VTextField label="Impersonate as user" v-model="impersonateUser" />
  <VTextField v-if="impersonateUser" label="Impersonate as group"
    v-model="impersonateGroup" />
  <VBtn @click="apply">Apply</VBtn>
</template>
