<script setup lang="ts">
import { VTabs } from 'vuetify/components';
import { useAppTabs } from '@/composables/appTabs';

defineOptions({ inheritAttrs: false });

const { render } = useAppTabs();
</script>

<template>
  <Teleport v-if="render" to="#appbar-tabs">
    <VTabs v-bind="$attrs" show-arrows>
      <slot />
    </VTabs>
  </Teleport>
</template>
