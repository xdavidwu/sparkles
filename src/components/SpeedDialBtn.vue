<script setup lang="ts">
import { VBtn, VCard } from 'vuetify/components';

const props = withDefaults(defineProps<{
  label: string,
  disabled?: boolean,
}>(), {
  disabled: false,
});

defineOptions({ inheritAttrs: false });
</script>

<template>
  <div class="d-flex justify-end align-center">
    <VCard class="me-3 py-1 px-2 text-body-2"
      :class="{ 'text-disabled': props.disabled }">{{ props.label }}</VCard>
    <VBtn v-bind="$attrs" :disabled="props.disabled" />
  </div>
</template>
