<script setup lang="ts">
import WithTOC from '@/components/WithTOC.vue';
import { VueComponent as Content } from '@/assets/docs.md';
import { onMounted, useTemplateRef } from 'vue';
import { externalizeLinks } from '@/utils/markdown';

const div = useTemplateRef('div');

onMounted(() => externalizeLinks(div.value!));

const navigate = (id: string) => window.location.hash = `#${id}`;
</script>

<template>
  <WithTOC class="markdown ma-n4" style="height: calc(100dvh - 64px)" @navigate="navigate">
    <div class="pa-4" ref="div">
      <Content />
    </div>
  </WithTOC>
</template>
