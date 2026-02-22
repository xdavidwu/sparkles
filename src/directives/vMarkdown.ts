import type { ObjectDirective } from 'vue';
import {
  renderer,
  softenFragmentNavigation, externalizeLinks, unarmRelativeLinks,
} from '@/utils/markdown';
import DOMPurify from 'dompurify';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { StyleModule } from 'style-mod';

export const vMarkdown: ObjectDirective<HTMLDivElement> = {
  created: (el, binding) => {
    StyleModule.mount(document, oneDarkHighlightStyle.module!);
    const rendered = DOMPurify.sanitize(renderer.render(binding.value));
    el.innerHTML = rendered;

    softenFragmentNavigation(el);
    externalizeLinks(el);
    unarmRelativeLinks(el);
  },
};
