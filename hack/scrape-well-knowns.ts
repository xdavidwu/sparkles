#!/usr/bin/env node

import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

const url = new URL('https://kubernetes.io/docs/reference/labels-annotations-taints/');

window.location.assign(url);

// XXX logo svg breaks happy-dom parser
const html = (await (await fetch(url)).text()).replace(/<svg(.*?)<\/svg>/, '');
const doc = new DOMParser().parseFromString(html, 'text/html');

const typesMap = {
  Label: 'labels',
  Annotation: 'annotations',
  Taint: 'taints',
};

const wellKnowns = Array.from(doc.querySelectorAll('h3[id]'))
  .map((t) => ({ key: t.innerHTML.split(' ')[0], node: t }))
  .filter(({ key }) => !key.includes('*') && !key.includes('['))
  .map(({ key, node }) => {
    const typesLine = (node.nextSibling as HTMLElement).innerText;
    const hasTypes = typesLine.startsWith('Type: ');
    if (!hasTypes) {
      console.warn('%s: `Type:` line not found, got: %s', key, typesLine);
    }

    const types = hasTypes ?
      Object.entries(typesMap)
        .filter((kv) => typesLine.includes(kv[0]))
        .map(([kv]) => kv[1])
      : ['annotations'];

    const holder = document.createElement('span');
    let c = node.nextSibling as HTMLElement;
    if (hasTypes) {
      c = c.nextSibling as HTMLElement;
    }
    while (c && !c.tagName.startsWith('H')) {
      holder.appendChild(c.cloneNode(true));
      c = c.nextSibling as HTMLElement;
    }

    holder.querySelectorAll('a[href^="#"]')
      .forEach((el) => el.removeAttribute('href'));

    holder.querySelectorAll('a[href^="/"]')
      .forEach((el) => el.setAttribute('href', url.origin + el.getAttribute('href')));

    holder.querySelectorAll('a[href]')
      .forEach((el) => el.setAttribute('target', '_blank'));

    holder.querySelectorAll('[class]')
      .forEach((el) => el.removeAttribute('class'));

    return { key, types, desc: holder.innerHTML };
  });

console.log(JSON.stringify(wellKnowns, null, 2));
