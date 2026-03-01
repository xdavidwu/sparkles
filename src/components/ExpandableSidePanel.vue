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
  <div class="position-sticky overflow-visible float-right top-0 h-0">
    <VCard class="panel mt-4" :class="{ expanded }">
      <div class="d-flex align-start">
        <div class="d-flex flex-column align-center justify-center py-2 align-self-stretch cursor-pointer"
          :class="{ 'text-medium-emphasis': !expanded, 'px-1': underOverlayScrollbar }"
          v-ripple @click="expanded = !expanded">
          <VIcon :icon="`mdi-chevron-${expanded ? 'right' : 'left'}`"
            variant="plain" size="x-small" />
          <div v-if="title" class="mt-1 text-vertical text-caption text-uppercase disable-selection">
            {{ title }}
          </div>
          <span class="overlay" />
        </div>
        <div v-show="expanded">
          <slot />
        </div>
      </div>
    </VCard>
  </div>
</template>

<style scoped>
.panel {
  background-color: rgba(54, 54, 54, var(--v-medium-emphasis-opacity));
}

.panel.expanded {
  /* stolen from v-text-field solo-filled, focused state */
  background-color: rgb(54, 54, 54);
}

.overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  opacity: 0;
  pointer-event: none;
  background: currentColor;
}

.overlay:hover {
  opacity: calc(var(--v-hover-opacity) * var(--v-theme-overlay-multiplier));
}

.text-vertical {
  writing-mode: vertical-rl;
}
</style>
