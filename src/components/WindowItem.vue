<script setup lang="ts">
import { VWindowItem } from 'vuetify/components';
import { provide, ref } from 'vue';
import { windowVisibilityInjectionKey } from '@/utils/keys';

const visible = ref<boolean | null>(null);

provide(windowVisibilityInjectionKey, visible);

const track = ({ value }: { value: boolean }) => visible.value = value;
</script>

<template>
  <VWindowItem @group:selected="track">
    <slot />
  </VWindowItem>
</template>
