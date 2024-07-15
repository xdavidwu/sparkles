<script setup lang="ts">
import { computed, onMounted } from 'vue';
import markdownit from 'markdown-it';
import DOMPurify from 'dompurify';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { parser as yamlParser } from '@lezer/yaml';
import { highlightCode } from '@lezer/highlight';
import { StyleModule } from 'style-mod';

const props = defineProps<{
  markdown: string;
}>();

// TODO fix links (trim relative ones?), make anchor works

const renderer = markdownit('commonmark', {
  html: true, // at least bitnami charts uses comments
  highlight: (code, lang) => {
    try {
      // maybe this is enough, we will see
      if (lang == 'yaml') {
        const tree = yamlParser.parse(code);
        let res = '';
        highlightCode(
          code, tree, oneDarkHighlightStyle,
          (c, classes) => {
            const s = document.createElement('span');
            s.innerText = c;
            s.setAttribute('class', classes);
            res += s.outerHTML;
          },
          () => res += '\n',
        );
        return res;
      }
    } catch (e) {
      console.log('lezer failed', e);
      return '';
    }
    return '';
  },
}).enable(['table']);

const rendered = computed(() => DOMPurify.sanitize(renderer.render(props.markdown)));

onMounted(() => {
  StyleModule.mount(document, oneDarkHighlightStyle.module!);
})
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
  background: #282c34;
  color: #abb2bf;
}

:deep(table) {
  border-collapse: collapse;
}

:deep(th), :deep(td) {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 4px;
}
</style>
