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
  <VOverlay location-strategy="connected" min-width="0" open-on-hover
    :scrim="false" :transition="false" v-model="visible">
    <template #activator="all">
      <slot name="activator" v-bind="all" />
    </template>
    <TooltipContent :text="text" :markdown="markdown" />
  </VOverlay>
</template>
