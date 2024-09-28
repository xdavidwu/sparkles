import type { ObjectDirective } from 'vue';
import markdownit from 'markdown-it';
import anchor from 'markdown-it-anchor';
import DOMPurify from 'dompurify';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { parser as yamlParser } from '@lezer/yaml';
import { highlightCode } from '@lezer/highlight';
import { StyleModule } from 'style-mod';

const renderer = markdownit('commonmark', {
  html: true, // at least bitnami charts uses comments
  linkify: true,
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
}).enable(['table', 'linkify']).use(anchor);
renderer.linkify.set({ fuzzyLink: false, fuzzyEmail: false });

export const vMarkdown: ObjectDirective<HTMLDivElement> = {
  created: (el, binding) => {
    StyleModule.mount(document, oneDarkHighlightStyle.module!);
    const rendered = DOMPurify.sanitize(renderer.render(binding.value));
    el.innerHTML = rendered;

    // anchors
    el.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href')!;
        el.querySelector(`#${CSS.escape(decodeURIComponent(id).substring(1))}`)?.scrollIntoView();
        e.preventDefault();
      });
    });

    // likely absolute
    el.querySelectorAll('a[href*="//"]').forEach((a) => {
      a.setAttribute('target', '_blank');
    });

    // not anchors and likely not absolute
    el.querySelectorAll('a:not([href^="#"]):not([href*="//"])').forEach((a) => {
      a.removeAttribute('href');
      a.setAttribute('class', 'text-white');
    });
  },
};
