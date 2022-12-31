import { foldService, IndentContext } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { hoverTooltip } from "@codemirror/view"

// TODO handle empty lines
export const indentFold = foldService.of(
  // line{Start,End} are (extent) positions of starting line
  (state: EditorState, lineStart: number, lineEnd: number) => {
    const context = new IndentContext(state);
    const indentStart = context.lineIndent(lineStart);

    let indentBlock;
    for (let i = state.doc.lineAt(lineStart).number + 1; i <= state.doc.lines; i++) {
      const indent = context.lineIndent(state.doc.line(i).from);

      if (indentBlock === undefined) {
        if (indent <= indentStart) {
          // not a start of block
          return null;
        }
        indentBlock = indent;
      }

      if (indent < indentBlock) {
        return {from: lineEnd, to: state.doc.line(i - 1).to};
      } else if (i === state.doc.lines) {
        return {from: lineEnd, to: state.doc.line(i).to};
      }
    }
    return null;
  }
);

type Range = [number, number];
type Tooltip = { range: Range, text: string };
export type Tooltips = Array<Tooltip>;

export const createTextTooltip = (tooltips: Tooltips) => hoverTooltip((view, pos) => {
  for (const tooltip of tooltips) {
    if (pos >= tooltip.range[0] && pos <= tooltip.range[1]) {
      return {
        pos: tooltip.range[0],
        end: tooltip.range[1],
        create: () => {
          const div = document.createElement('div');
          div.style.margin = '0.5em 1em';
          div.textContent = tooltip.text;
          div.innerHTML = div.innerHTML.replace(/((http:|https:)[^\s]+[\w])/g, (match) => {
            let url;
            try {
              url = new URL(match);
            } catch (e) {
              return match;
            }
            const a = document.createElement('a');
            a.target = '_blank';
            a.href = url.href;
            a.textContent = match;
            return a.outerHTML;
          });
          return { dom: div };
        },
      };
    }
  }
  return null;
});
