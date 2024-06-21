<script setup lang="ts">
import { VProgressCircular } from 'vuetify/components';
</script>

<template>
  <Suspense timeout="16">
    <slot />
    <template #fallback>
      <div class="d-flex justify-center align-center flex-column full-height">
        <VProgressCircular indeterminate class="mb-4" />
        Loading...
      </div>
    </template>
  </Suspense>
</template>
