<script setup lang="ts">
import HoverTooltip from '@/components/HoverTooltip.vue';
import { VBtn } from 'vuetify/components';
import { computed } from 'vue';

const props = defineProps<{
  tooltip: string;
  disabledReason?: string;
}>();

const text = computed(() => props.disabledReason ?
  `${props.tooltip} (${props.disabledReason})` : props.tooltip);

defineOptions({ inheritAttrs: false });
</script>

<!-- VBtn does VIcon only if default slot not used -->
<template>
  <HoverTooltip :text="text">
    <template #activator="{ props }">
      <span v-bind="props" class="d-inline-block">
        <VBtn :disabled="!!disabledReason" v-bind="$attrs" />
      </span>
    </template>
  </HoverTooltip>
</template>
