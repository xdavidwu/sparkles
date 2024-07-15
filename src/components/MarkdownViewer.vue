<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import markdownit from 'markdown-it';
import anchor from 'markdown-it-anchor';
import DOMPurify from 'dompurify';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { parser as yamlParser } from '@lezer/yaml';
import { highlightCode } from '@lezer/highlight';
import { StyleModule } from 'style-mod';

const props = defineProps<{
  markdown: string;
}>();

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
}).enable(['table']).use(anchor);

const div = ref<HTMLDivElement>();
const rendered = computed(() => DOMPurify.sanitize(renderer.render(props.markdown)));

onMounted(() => {
  StyleModule.mount(document, oneDarkHighlightStyle.module!);
  watch(rendered, () => {
    // anchors
    div.value?.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href')!;
        div.value!.querySelector(id)?.scrollIntoView();
        e.preventDefault();
      });
    });
    // not anchors and likely not absolute
    div.value?.querySelectorAll('a:not([href^="#"]):not([href*="//"])').forEach((a) => {
      a.removeAttribute('href');
      a.setAttribute('class', 'text-white');
    });
  }, { immediate: true });
})
</script>

<template>
  <div ref="div" class="overflow-y-auto" v-html="rendered" />
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
