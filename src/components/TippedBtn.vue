<script setup lang="ts">
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import { VBtn } from 'vuetify/components';

defineProps<{
  tooltip: string,
}>();

defineOptions({ inheritAttrs: false });
</script>

<!-- XXX: VBtn does VIcon only if default slot not used -->
<template>
  <LinkedTooltip :text="tooltip">
    <template #activator="{ props }">
      <VBtn v-bind="{ ...$attrs, ...props }" />
    </template>
  </LinkedTooltip>
</template>
