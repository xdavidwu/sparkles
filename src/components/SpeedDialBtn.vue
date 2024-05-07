<script setup lang="ts">
import { VBtn, VCard } from 'vuetify/components';

defineProps<{
  label: string,
}>();

defineOptions({ inheritAttrs: false });
</script>

<!-- XXX: VBtn does VIcon only if default slot not used -->
<template>
  <div class="d-flex justify-end align-center">
    <VCard class="me-3 py-1 px-2 text-body-2">{{ label }}</VCard>
    <VBtn v-bind="$attrs" />
  </div>
</template>
