<script setup lang="ts">
import { VBtn, VCol, VRow, VSelect, VTextField } from 'vuetify/components';
import { ref, computed } from 'vue';
import { computedAsync } from '@vueuse/core';
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { doSelfSubjectReview, errorIsTypeUnsupported } from '@/utils/api';

const configStore = useApiConfig();
const config = await configStore.getConfig();
const { configurable } = configStore;

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

const supportedApis = computedAsync(async () => {
  const groups = await useApisDiscovery().getGroups();
  return groups.map((g) =>
    g.metadata!.name ? `${g.metadata!.name}/${g.versions[0].version}` : g.versions[0].version);
}, null);

const review = computedAsync(async () => {
  try {
    return await doSelfSubjectReview(config);
  } catch (err) {
    if (await errorIsTypeUnsupported(err)) {
      console.log('No SelfSubjectReview support, cannot identify ourselves');
    } else {
      throw err;
    }
  }
}, null);

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

const debugInfo = computed(() => {
  let info = `${ brand } version: ${ version }\n` +
    `Kubernetes version: ${ kubernetesVersion.value }\n`;
  if (review.value) {
    info += `User: ${review.value.status?.userInfo?.username}\n` +
      `Groups: ${review.value.status?.userInfo?.groups?.join(', ')}\n`;
  }
  if (supportedApis.value) {
    info += `Supported APIs:\n - ${supportedApis.value.join('\n - ')}\n`;
  }
  return info;
});

const copy = () => navigator.clipboard.writeText(debugInfo.value);
</script>

<template>
  <VRow>
    <VCol :col="configurable ? 6 : 12">
      <pre class="text-pre-wrap">{{ debugInfo }}</pre>
      <VBtn class="mt-4" @click="copy">Copy</VBtn>
    </VCol>
    <VCol col="6" v-if="configurable">
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
