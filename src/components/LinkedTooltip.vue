<script lang="ts" setup>
import { VOverlay } from 'vuetify/components';
import LinkedTooltipContent from '@/components/LinkedTooltipContent.vue';
import { ref, inject, watch } from 'vue';
import { windowVisibilityInjectionKey } from '@/utils/keys';

const props = defineProps<{
  text: string,
}>();

const visible = ref(false);

const windowVisibility = inject(windowVisibilityInjectionKey, null);

if (windowVisibility !== null) {
  watch(windowVisibility, (windowVisible) => {
    if (!windowVisible) {
      visible.value = false;
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
    <LinkedTooltipContent :text="props.text" />
  </VOverlay>
</template>
