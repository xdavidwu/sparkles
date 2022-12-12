<template>
  <h1>Handling OIDC auth...</h1>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';

export default defineComponent({
  async created() {
    const user = await useApiConfig().userManager.signinRedirectCallback();
    this.$router.push(user.state as string);
  }
});
</script>
