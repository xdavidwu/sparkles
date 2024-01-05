<script setup lang="ts">
import { VBtn, VCol, VRow, VSelect, VTextField } from 'vuetify/components';
import { ref } from 'vue';
import { computedAsync } from '@vueuse/core';
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';
import { useApisDiscovery } from '@/stores/apisDiscovery';

const configStore = useApiConfig();

const schemes = Object.entries(AuthScheme).filter((i) => isNaN(Number(i[0])));
const scheme = ref(configStore.authScheme);
const token = ref(configStore.accessToken);
const impersonateUser = ref(configStore.impersonation.asUser);
const impersonateGroup = ref(configStore.impersonation.asGroup);

const brand = import.meta.env.VITE_APP_BRANDING ?? 'Sparkles';
const version = '__version_placeholder__';
const kubernetesVersion = computedAsync(async () => {
  const info = await useApisDiscovery().getVersionInfo();
  return info.gitVersion;
}, 'unknown');

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
  <VRow>
    <VCol col="6">
      <pre>
        {{ brand }} version: {{ version }}
        Kubernetes version: {{ kubernetesVersion }}
      </pre>
    </VCol>
    <VCol col="6">
      <VSelect label="Authentication method" v-model="scheme" :items="schemes"
        item-value="1" item-title="0" />
      <VTextField v-if="scheme === AuthScheme.AccessToken" label="Bearer token"
        v-model="token" />
      <VTextField label="Impersonate as user" v-model="impersonateUser" />
      <VTextField v-if="impersonateUser" label="Impersonate as group"
        v-model="impersonateGroup" />
      <VBtn @click="apply">Apply</VBtn>
    </VCol>
  </VRow>
</template>
