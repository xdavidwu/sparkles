<script setup lang="ts">
import { VTabsWindowItem } from 'vuetify/components';
import { computed, inject, provide, ref } from 'vue';
import { windowSelectionInjectionKey, windowVisibilityInjectionKey } from '@/utils/keys';

const props = defineProps<{
  value: string;
}>();

const selection = inject(windowSelectionInjectionKey, ref(''));

const visible = computed(() => selection.value === props.value);

provide(windowVisibilityInjectionKey, visible);
</script>

<template>
  <VTabsWindowItem :value="props.value">
    <slot />
  </VTabsWindowItem>
</template>
