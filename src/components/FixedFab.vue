<script setup lang="ts">
import { VFab, VScaleTransition, VIcon } from 'vuetify/components';
import { ref, inject } from 'vue';
import { windowVisibilityInjectionKey } from '@/utils/keys';

defineOptions({ inheritAttrs: false });

const visible = inject(windowVisibilityInjectionKey, ref(true));
</script>

<template>
  <!-- untie it with vwindow -->
  <Teleport to="main">
    <!-- XXX origin accuracy? -->
    <VScaleTransition appear origin="bottom center">
      <VFab v-bind="$attrs" v-if="visible" color="primary" app location="right bottom">
        <!-- XXX maybe tsx or h so we can really fill vfab iff slot used -->
        <slot>
          <VIcon :icon="$attrs['icon'] as InstanceType<typeof VIcon>['$props']['icon']" />
        </slot>
      </VFab>
    </VScaleTransition>
  </Teleport>
</template>
