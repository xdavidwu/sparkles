<script setup lang="ts">
import LoadingSpinner from '@/components/LoadingSpinner.vue';
</script>

<template>
  <Suspense timeout="16">
    <slot />
    <template #fallback>
      <LoadingSpinner />
    </template>
  </Suspense>
</template>
