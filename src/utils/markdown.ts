import markdownit from 'markdown-it';
import anchor from 'markdown-it-anchor';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { parser as yamlParser } from '@lezer/yaml';
import { highlightCode } from '@lezer/highlight';

export const renderer = markdownit('commonmark', {
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

// fragment navigation without affecting current URL
// this needs to be handled after rendering to make sanitizing easier
export const softenFragmentNavigation = (el: HTMLElement) =>
  el.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')!;
      el.querySelector(`#${CSS.escape(decodeURIComponent(id).substring(1))}`)?.scrollIntoView();
      e.preventDefault();
    });
  });


// TODO rewrite these below with chaining markdown-it renderer rules

// make likely absolute links open in new tab
export const externalizeLinks = (el: HTMLElement) =>
  el.querySelectorAll('a[href*="//"]').forEach((a) => {
    a.setAttribute('target', '_blank');
  });

// for third-party content, except scheme-relative ones
export const unarmRelativeLinks = (el: HTMLElement) =>
  el.querySelectorAll('a:not([href^="#"]):not([href*="//"])').forEach((a) => {
    a.removeAttribute('href');
    a.setAttribute('class', 'text-white');
  });
