<script setup lang="ts">
import WithTOC from '@/components/WithTOC.vue';
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
        div.value!.querySelector(`#${CSS.escape(decodeURIComponent(id).substring(1))}`)?.scrollIntoView();
        e.preventDefault();
      });
    });

    // likely absolute
    div.value?.querySelectorAll('a[href*="//"]').forEach((a) => {
      a.setAttribute('target', '_blank');
    });

    // not anchors and likely not absolute
    div.value?.querySelectorAll('a:not([href^="#"]):not([href*="//"])').forEach((a) => {
      a.removeAttribute('href');
      a.setAttribute('class', 'text-white');
    });
  }, { immediate: true });
});

const navigate = (id: string) => div.value?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView();
</script>

<template>
  <WithTOC @navigate="navigate">
    <div ref="div" class="pe-4 markdown" v-html="rendered" />
  </WithTOC>
</template>
