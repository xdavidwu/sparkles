import { type Highlighter, highlightCode } from '@lezer/highlight';
import type { LRParser } from '@lezer/lr';

export const highlight =
    (code: string, parser: LRParser, highlighter: Highlighter) => {
  const tree = parser.parse(code);

  let res = '';
  highlightCode(
    code, tree, highlighter,
    (c, classes) => {
      const s = document.createElement('span');
      s.innerText = c;
      s.setAttribute('class', classes);
      res += s.outerHTML;
    },
    () => res += '\n',
  );
  return res;
};
