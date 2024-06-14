<script setup lang="ts">
import { computed } from 'vue';
import { VCard, VDialog, VProgressCircular } from 'vuetify/components';
import { useInterval } from '@vueuse/core';

const props = defineProps<{
  text: string;
  title: string;
}>();

const count = useInterval(500);
const dots = computed(() => {
  const ndots = count.value % 4;
  return '.'.repeat(ndots) + ' '.repeat(3 - ndots);
});
</script>

<template>
  <VDialog persistent>
    <VCard class="align-self-center" :title="props.title">
      <div class="d-flex flex-column align-center text-center px-8 pb-8" style="min-width: 20vw">
        <VProgressCircular class="my-6" indeterminate />
        <pre>{{ props.text }}{{ dots }}</pre>
      </div>
    </VCard>
  </VDialog>
</template>
