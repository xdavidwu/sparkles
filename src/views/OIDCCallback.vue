<script setup lang="ts">
import { useApiConfig } from '@/stores/apiConfig';
import { useRouter } from 'vue-router';
import { onMounted } from 'vue';

onMounted(async () => {
  const user = await useApiConfig().userManager.signinRedirectCallback();
  useRouter().push(user.state as string);
});
</script>

<template>
  <h1>Handling OIDC auth...</h1>
</template>
