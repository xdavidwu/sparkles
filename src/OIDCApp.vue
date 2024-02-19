<script setup lang="ts">
import App from '@/App.vue';
import { ref, onMounted } from 'vue';
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';

const oidcCompleted = ref(false);
const apiConfigStore = useApiConfig();

onMounted(async () => {
  if (apiConfigStore.authScheme === AuthScheme.OIDC) {
    const base = (new URL(import.meta.env.BASE_URL, window.location.origin)).pathname.replace(/\/$/, '');
    const path = window.location.pathname.replace(base, '');
    if (path === '/oidc/callback') {
      const user = await apiConfigStore.userManager.signinRedirectCallback();
      window.location.replace(user.state as string);
    } else {
      await apiConfigStore.getIdToken();
    }
  }
  oidcCompleted.value = true;
});
</script>

<template>
  <App v-if="oidcCompleted" />
  <div v-else>
    Handling OIDC authentication...
  </div>
</template>
