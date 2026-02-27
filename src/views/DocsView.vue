<script setup lang="ts">
import WithTOC from '@/components/WithTOC.vue';
import { VueComponent as Content } from '@/assets/docs.md';

const navigate = (id: string) => window.location.hash = `#${id}`;
</script>

<template>
  <WithTOC class="markdown ma-n4" style="height: calc(100dvh - 64px)" @navigate="navigate">
    <div class="pa-4">
      <Content />
    </div>
  </WithTOC>
</template>
