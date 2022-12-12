<template>
  <div class="about">
    <h1>Handling OIDC auth...</h1>
  </div>
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

<style>
@media (min-width: 1024px) {
  .about {
    min-height: 100vh;
    display: flex;
    align-items: center;
  }
}
</style>
