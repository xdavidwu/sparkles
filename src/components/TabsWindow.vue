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
  <VTabsWindow :model-value="props.modelValue">
    <slot />
  </VTabsWindow>
</template>
