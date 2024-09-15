<script setup lang="ts">
import WithTOC from '@/components/WithTOC.vue';
import { VueComponent as Content } from '@/assets/docs.md';
import { onMounted, useTemplateRef } from 'vue';

const div = useTemplateRef('div');

onMounted(() => {
  div.value?.querySelectorAll('a[href*="//"]').forEach((a) => {
    a.setAttribute('target', '_blank');
  });
});

const navigate = (id: string) => window.location.hash = `#${id}`;
</script>

<template>
  <WithTOC class="markdown ma-n4" style="height: calc(100dvh - 64px)" @navigate="navigate">
    <div class="pa-4" ref="div">
      <Content />
    </div>
  </WithTOC>
</template>
