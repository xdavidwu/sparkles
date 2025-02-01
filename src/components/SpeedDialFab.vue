<script setup lang="ts">
import { VSpeedDial, VFab, VIcon } from 'vuetify/components';
import FixedFab from '@/components/FixedFab.vue';
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  icon?: string,
}>(), {
  icon: 'mdi-dots-vertical',
});

const opened = ref(false);
</script>

<!-- fixedfab contains an outer positioning div and inner containers
  we want inner container here for vspeeddial positioning -->
<template>
  <FixedFab icon :class="{ 'opacity-0': opened }">
    <VIcon :icon="props.icon"/>
    <VSpeedDial v-model="opened" scrim location="top end" activator="parent">
      <slot />
      <!-- display our own on top of scrim, also hide original one
        in case of inaccurate positioning (rounding issues?) -->
      <div class="mb-n1" key="0">
        <VFab icon="$close" color="primary" class="float-end mb-n16 mt-1" />
      </div>
    </VSpeedDial>
  </FixedFab>
</template>
