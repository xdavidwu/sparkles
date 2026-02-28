<script lang="ts" setup>
import { ref } from 'vue';
import { VCard, VIcon } from 'vuetify/components';
import { Ripple as vRipple } from 'vuetify/directives';
import { useParentElement, useResizeObserver } from '@vueuse/core';

defineProps<{
  title?: string;
}>();

const expanded = ref(false);
const container = useParentElement();
// enables padding, to make sure not getting occluded
const underOverlayScrollbar = ref(false);

useResizeObserver(container, () => {
  const c = container.value! as HTMLElement;
  const overflows = c.scrollHeight > c.clientHeight;
  const hasClassicScrollbar = (c.offsetWidth - c.clientWidth) > 0;
  underOverlayScrollbar.value = overflows && !hasClassicScrollbar;
});
</script>

<template>
  <div class="holder">
    <VCard class="panel" :class="{ expanded }">
      <div class="d-flex align-start">
        <div class="d-flex flex-column align-center justify-center py-2 align-self-stretch cursor-pointer"
          :class="{ 'text-medium-emphasis': !expanded, 'px-1': underOverlayScrollbar }"
          v-ripple @click="expanded = !expanded">
          <VIcon :icon="`mdi-chevron-${expanded ? 'right' : 'left'}`"
            variant="plain" size="x-small" />
          <div v-if="title" class="mt-1 text-vertical text-caption text-uppercase">
            {{ title }}
          </div>
        </div>
        <div v-show="expanded" class="ps-1">
          <slot />
        </div>
      </div>
    </VCard>
  </div>
</template>

<style scoped>
.holder {
  position: sticky;
  overflow: visible;
  float: right;
  top: 8px;
  height: 0px;
}

.panel {
  background-color: rgba(54, 54, 54, var(--v-medium-emphasis-opacity));
}

.panel.expanded {
  /* stolen from v-text-field solo-filled, focused state */
  background-color: rgb(54, 54, 54);
}

.text-vertical {
  writing-mode: vertical-rl;
}
</style>
