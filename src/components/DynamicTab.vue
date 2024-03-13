<script setup lang="ts">
import { VBadge, VBtn, VTab } from 'vuetify/components';

withDefaults(defineProps<{
  alerting: boolean,
  title: string,
  description: string,
}>(), {
  alerting: false,
  description: '',
});

const emit = defineEmits<{
  (e: 'close'): void,
}>();
</script>

<template>
  <VTab>
    <div :title="description">
      <VBadge dot color="red" :model-value="alerting">
        {{ title }}
      </VBadge>
    </div>
    <VBtn size="x-small" icon="mdi-close" variant="plain" @click.stop="emit('close')" />
  </VTab>
</template>
