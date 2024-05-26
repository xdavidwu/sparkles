<script setup lang="ts">
import { VSpeedDial, VFab } from 'vuetify/components';
import FixedFab from '@/components/FixedFab.vue';

defineOptions({ inheritAttrs: false });
</script>

<template>
  <VSpeedDial scrim location="top end" :offset="[ 24, 44 ]">
    <template #activator="{ props }">
      <FixedFab icon="mdi-dots-vertical" v-bind="{ ...props, ...$attrs }" />
    </template>
    <slot />
    <VFab key="0" icon="$close" color="primary" absolute class="fab-overlay" />
  </VSpeedDial>
</template>

<style scoped>
.fab-overlay {
  bottom: -48px;
  right: -4px;
}
</style>
