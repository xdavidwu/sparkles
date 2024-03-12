<script setup lang="ts">
import App from '@/App.vue';
import { ref, onMounted } from 'vue';
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';

const oidcCompleted = ref(false);
const message = ref('Handling OIDC authentication...');
const apiConfigStore = useApiConfig();

onMounted(async () => {
  if (apiConfigStore.authScheme !== AuthScheme.OIDC) {
    oidcCompleted.value = true;
    return;
  }

  const base = (new URL(window.__base_url, window.location.origin)).pathname.replace(/\/$/, '');
  const path = window.location.pathname.replace(base, '');
  if (path === '/oidc/callback') {
    const user = await apiConfigStore.userManager.signinRedirectCallback();
    window.location.replace(user.state as string);
  } else if (path === '/oidc/logout') {
    apiConfigStore.userManager.removeUser();
    message.value = 'Logged out';
  } else {
    await apiConfigStore.getIdToken();
    oidcCompleted.value = true;
  }
});
</script>

<template>
  <App v-if="oidcCompleted" />
  <div v-else>
    {{ message }}
  </div>
</template>
