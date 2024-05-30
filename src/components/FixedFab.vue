<script setup lang="ts">
import { VFab, VScaleTransition } from 'vuetify/components';
import { ref, inject } from 'vue';
import { windowVisibilityInjectionKey } from '@/utils/keys';

defineOptions({ inheritAttrs: false });

const visible = inject(windowVisibilityInjectionKey, ref(true));
</script>

<template>
  <!-- untie it with vwindow -->
  <Teleport to="main">
    <!-- fab uses absolute positioning internally, container has no width -->
    <VScaleTransition appear origin="24px center">
      <VFab v-bind="$attrs" v-if="visible" color="primary" class="fixed-fab" />
    </VScaleTransition>
  </Teleport>
</template>

<style scoped>
.fixed-fab {
  position: fixed;
  bottom: 40px;
  right: 64px;
}
</style>
