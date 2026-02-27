import markdownit from 'markdown-it';
import anchor from 'markdown-it-anchor';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import type { LRParser } from '@lezer/lr'
import { parser as yamlParser } from '@lezer/yaml';

// this file is also used in vite config,
// where import path aliasing is not available
import { highlight } from './lezer';

const parsers: { [k in string]: LRParser } = {
  // maybe this is enough, we will see
  yaml: yamlParser,
};

export const renderer = markdownit('commonmark', {
  html: true, // at least bitnami charts uses comments
  linkify: true,
  highlight: (code, lang) => {
    try {
      const parser = parsers[lang];
      if (parser) {
        return highlight(code, parser, oneDarkHighlightStyle);
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
