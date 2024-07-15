<script setup lang="ts">
import { computed } from 'vue';
import markdownit from 'markdown-it';
import DOMPurify from 'dompurify';

const props = defineProps<{
  markdown: string;
}>();

// TODO fix links (trim relative ones?), make anchor works
// TODO port highlighting from lezer somehow

const renderer = markdownit('commonmark', {
  html: true, // at least bitnami charts uses comments
}).enable(['table']);

const rendered = computed(() => DOMPurify.sanitize(renderer.render(props.markdown)));
</script>

<template>
  <div class="overflow-y-auto" v-html="rendered" />
</template>

<style scoped>
:deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6), :deep(p) {
  margin-top: 12px;
  margin-bottom: 4px;
}

:deep(li) {
  margin-left: 16px;
  margin-top: 2px;
}

:deep(code) {
  padding: 0 2px;
  background: black;
}

:deep(pre > code) {
  padding: 4px;
  display: block;
}

:deep(table) {
  border-collapse: collapse;
}

:deep(th), :deep(td) {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 4px;
}
</style>
