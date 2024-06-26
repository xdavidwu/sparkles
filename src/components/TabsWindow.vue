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
  <VTabsWindow :model-value="props.modelValue" class="ma-n4"
    style="min-height: calc(100% + 32px); /* avoid lags from growing */">
    <slot />
  </VTabsWindow>
</template>
