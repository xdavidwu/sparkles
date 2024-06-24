<script setup lang="ts">
import { VTabsWindow } from 'vuetify/components';
import { provide, toRef } from 'vue';
import { windowSelectionInjectionKey } from '@/utils/keys';

const props = defineProps<{
  modelValue: string;
}>();

provide(windowSelectionInjectionKey, toRef(() => props.modelValue));
</script>

<template>
  <VTabsWindow :model-value="props.modelValue" class="mh-100 ma-n4">
    <slot />
  </VTabsWindow>
</template>

<style scoped>
/* avoid lags from growing to editor */
.mh-100 {
  min-height: 100%;
}
</style>
