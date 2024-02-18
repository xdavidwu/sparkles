<script setup lang="ts">
import { VTabs } from 'vuetify/components';

defineOptions({ inheritAttrs: false });
</script>

<template>
  <Teleport to="#appbar-tabs">
    <VTabs v-bind="$attrs">
      <slot />
    </VTabs>
  </Teleport>
</template>
