<script setup lang="ts">
import { VTabs } from 'vuetify/components';
import { ref, nextTick, watch } from 'vue';
import { useDisplay } from 'vuetify';

defineOptions({ inheritAttrs: false });

const render = ref(true);

const { xs: expandAppBar } = useDisplay();

watch(expandAppBar, async () => {
  render.value = false;
  await nextTick();
  render.value = true;
});
</script>

<template>
  <Teleport v-if="render" to="#appbar-tabs">
    <VTabs v-bind="$attrs" show-arrows>
      <slot />
    </VTabs>
  </Teleport>
</template>
