<script lang="ts" setup>
import { VOverlay } from 'vuetify/components';
import LinkedTooltipContent from '@/components/LinkedTooltipContent.vue';

const props = defineProps<{
  text: string,
}>();
</script>

<template>
  <VOverlay location-strategy="connected" min-width="0" open-on-hover
    :scrim="false" :transition="false">
    <template #activator="all">
      <slot name="activator" v-bind="all" />
    </template>
    <LinkedTooltipContent :text="props.text" />
  </VOverlay>
</template>
