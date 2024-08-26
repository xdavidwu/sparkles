<script lang="ts" setup>
import { ref } from 'vue';
import { VCard, VIcon } from 'vuetify/components';
import { Ripple as vRipple } from 'vuetify/directives';

const expanded = ref(false);

defineProps<{
  title?: string;
  offset?: number;
}>();
</script>

<template>
  <VCard class="panel" :class="{ expanded, 'text-medium-emphasis': !expanded }"
    :style='`right: ${offset ?? 0}px`'>
    <div class="d-flex align-center">
      <div class="d-flex flex-column align-center toggle py-2" v-ripple
        @click="expanded = !expanded">
        <VIcon :icon="`mdi-chevron-${expanded ? 'right' : 'left'}`"
          variant="plain" size="x-small" />
        <div v-if="title" class="mt-1 text-vertical text-caption text-uppercase">
          {{ title }}
        </div>
      </div>
      <div v-if="expanded" class="pa-1">
        <slot />
      </div>
    </div>
  </VCard>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 8px;
  z-index: 1000;
  background-color: rgba(var(--v-theme-surface-light), var(--v-medium-emphasis-opacity));
}

.panel.expanded {
  background-color: rgb(var(--v-theme-surface-light));
}

.text-vertical {
  writing-mode: vertical-rl;
}
</style>
