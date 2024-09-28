<script setup lang="ts">
import HoverTooltip from '@/components/HoverTooltip.vue';
import { VBtn } from 'vuetify/components';

defineProps<{
  tooltip: string,
}>();

defineOptions({ inheritAttrs: false });
</script>

<!-- VBtn does VIcon only if default slot not used -->
<template>
  <HoverTooltip :text="tooltip">
    <template #activator="{ props }">
      <span v-bind="props" class="d-inline-block">
        <VBtn v-bind="$attrs" />
      </span>
    </template>
  </HoverTooltip>
</template>
