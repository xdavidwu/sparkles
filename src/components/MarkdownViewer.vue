<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import StyledMarkdown from '@/components/StyledMarkdown.vue';
import TableOfContents from '@/components/TableOfContents.vue';
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
const toc = ref<Array<{ level: number, id: string, title: string }>>([]);
const rendered = computed(() => DOMPurify.sanitize(renderer.render(props.markdown)));

onMounted(() => {
  StyleModule.mount(document, oneDarkHighlightStyle.module!);

  watch(rendered, () => {
    toc.value = Array.from(div.value?.querySelectorAll('h1, h2, h3, h4, h5, h6') as NodeListOf<HTMLElement> ?? []).map((h) => ({
      level: Number(h.tagName.substring(1)),
      id: h.getAttribute('id')!,
      title: h.innerText,
    }));

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
  <div>
    <StyledMarkdown class="overflow-y-auto h-100 pe-4">
      <div ref="div" v-html="rendered" />
    </StyledMarkdown>
    <TableOfContents :toc="toc" @navigate="navigate" />
  </div>
</template>
