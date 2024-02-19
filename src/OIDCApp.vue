<script setup lang="ts">
import App from '@/App.vue';
import { ref, onMounted } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';

const oidcCompleted = ref(false);

onMounted(async () => {
  const base = (new URL(import.meta.env.BASE_URL, window.location.origin)).pathname.replace(/\/$/, '');
  const path = window.location.pathname.replace(base, '');
  if (path === '/oidc/callback') {
    const user = await useApiConfig().userManager.signinRedirectCallback();
    window.location.replace(user.state as string);
  } else {
    await useApiConfig().getBearerToken();
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
