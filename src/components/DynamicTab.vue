<script setup lang="ts">
import HoverTooltip from '@/components/HoverTooltip.vue';
import { VBadge, VBtn, VTab } from 'vuetify/components';

withDefaults(defineProps<{
  alerting?: boolean,
  title: string,
  description?: string,
}>(), {
  alerting: false,
});

const emit = defineEmits<{
  (e: 'close'): void,
}>();

// TODO global alerting state management, dynamice favicon
// probably also web notification?
</script>

<template>
  <VTab>
    <VBadge dot color="red" :model-value="alerting">
      {{ title }}
    </VBadge>
    <VBtn size="x-small" icon="$close" variant="plain" class="mx-n1" @click.stop="emit('close')" />
    <HoverTooltip v-if="description" :text="description" activator="parent" />
  </VTab>
</template>
