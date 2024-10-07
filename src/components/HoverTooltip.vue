<script lang="ts" setup>
import { VOverlay } from 'vuetify/components';
import TooltipContent from '@/components/TooltipContent.vue';
import { ref, inject, watch } from 'vue';
import { windowVisibilityInjectionKey } from '@/utils/keys';

defineProps<{
  text: string,
  markdown?: boolean,
}>();

const visible = ref(false);

const windowVisibility = inject(windowVisibilityInjectionKey, null);

if (windowVisibility !== null) {
  watch(windowVisibility, (windowVisible) => {
    if (!windowVisible) {
      // XXX?
      setTimeout(() => visible.value = false, 0);
    }
  });
}
</script>

<template>
  <VOverlay v-model="visible" :scrim="false" :transition="false" min-width="0"
    location-strategy="connected" scroll-strategy="reposition" open-on-hover>
    <template #activator="all">
      <slot name="activator" v-bind="all" />
    </template>
    <TooltipContent :text="text" :markdown="markdown" />
  </VOverlay>
</template>
