<template>
  <div class="about">
    <h1>Handling OIDC auth...</h1>
  </div>
</template>

<script lang="ts">
import { useApiConfig } from '@/stores/apiConfig';

export default {
  async created() {
    const user = await useApiConfig().userManager.signinRedirectCallback();
    this.$router.push(user.state);
  }
};
</script>

<style>
@media (min-width: 1024px) {
  .about {
    min-height: 100vh;
    display: flex;
    align-items: center;
  }
}
</style>
