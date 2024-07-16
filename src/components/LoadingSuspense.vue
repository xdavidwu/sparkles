<script setup lang="ts">
import LoadingSpinner from '@/components/LoadingSpinner.vue';

defineOptions({ inheritAttrs: false });
</script>

<template>
  <Suspense timeout="16">
    <slot />
    <template #fallback>
      <LoadingSpinner v-bind="$attrs" />
    </template>
  </Suspense>
</template>
