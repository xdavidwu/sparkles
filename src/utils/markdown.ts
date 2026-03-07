import markdownit, { type PluginSimple } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
// @ts-expect-error no type definition
import { parser as shellParser } from '@fig/lezer-bash';
import type { LRParser } from '@lezer/lr'
import { parser as yamlParser } from '@lezer/yaml';

// this file is also used in vite config,
// where import path aliasing is not available
import { highlight } from './lezer';

const parsers: { [k in string]: LRParser } = {
  yaml: yamlParser,

  console: shellParser,
  sh: shellParser,
  bash: shellParser,
};

type RuleNames = keyof markdownit['renderer']['rules'];
type RendererRule = NonNullable<markdownit['renderer']['rules'][RuleNames]>;

const callRenderTokens: RendererRule =
  (tokens, idx, options, env, self) => self.renderToken(tokens, idx, options);

const makeRuleOverridePlugin =
  (name: RuleNames, over: (original: RendererRule) => RendererRule): PluginSimple =>
    (md) => {
      md.renderer.rules[name] = over(md.renderer.rules[name] || callRenderTokens);
    };

// there is also a DOM version for applying after DOMPurify
const externalizeLinksByPlugin = makeRuleOverridePlugin(
  'link_open',
  (original) => function (tokens, idx, options, env, self) {
    const token = tokens[idx]!;
    const href = token.attrGet('href');
    if (href?.includes('//')) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noreferrer');
    }
    return original(tokens, idx, options, env, self);
  },
);

// for third-party content, except scheme-relative ones
const unarmRelativeLinks = makeRuleOverridePlugin(
  'link_open',
  (original) => function (tokens, idx, options, env, self) {
    const token = tokens[idx]!;
    const href = token.attrGet('href');
    if (href && !href.includes('//') && !href.startsWith('#')) {
      token.attrs!.splice(token.attrIndex('href'));
      token.attrSet('class', 'text-white');
    }
    return original(tokens, idx, options, env, self);
  },
);

const makeRenderer = () => {
  const renderer = markdownit('commonmark', {
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

  return renderer;
};

export const trustedRenderer = makeRenderer().use(externalizeLinksByPlugin);

// for untrusted content, caller should sanitize after rendering
// links are to be externalized after sanitizer
export const renderer = makeRenderer().use(unarmRelativeLinks);

export const softNavigate = (el: HTMLElement, id: string) => {
  const target = el.querySelector(`#${CSS.escape(id)}`);
  target?.scrollIntoView();
  target?.classList.add('highlight');
  setTimeout(() => target?.classList.remove('highlight'), 2000);
};

// fragment navigation without affecting current URL
// this needs to be handled after rendering to make sanitizing easier
export const softenFragmentNavigation = (el: HTMLElement) =>
  el.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href')!;
      softNavigate(el, decodeURIComponent(hash).substring(1));
      e.preventDefault();
    });
  });

export const externalizeLinks = (el: HTMLElement) =>
  el.querySelectorAll('a[href*="//"]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noreferrer');
  });
