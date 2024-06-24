<script setup lang="ts">
import { VTabs } from 'vuetify/components';
import { renderAppTabs } from '@/composables/appTabs';

defineOptions({ inheritAttrs: false });

// trigger re-teleport to different actual target
const { expandAppBar } = renderAppTabs();
</script>

<template>
  <Teleport :key="`${expandAppBar}`" to="#appbar-tabs">
    <VTabs v-bind="$attrs" show-arrows>
      <slot />
    </VTabs>
  </Teleport>
</template>
