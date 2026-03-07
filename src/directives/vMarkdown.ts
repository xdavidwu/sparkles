import type { FunctionDirective } from 'vue';
import { renderer, externalizeLinks, softenFragmentNavigation } from '@/utils/markdown';
import DOMPurify from 'dompurify';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { StyleModule } from 'style-mod';

StyleModule.mount(document, oneDarkHighlightStyle.module!);

export const vMarkdown: FunctionDirective<HTMLDivElement> = (el, binding) => {
  if (binding.value === binding.oldValue) {
    return;
  }

  const rendered = DOMPurify.sanitize(renderer.render(binding.value));
  el.innerHTML = rendered;

  externalizeLinks(el);
  softenFragmentNavigation(el);
};
