import LinkedTooltipContent from '@/components/LinkedTooltipContent.vue';
import { type Ref, createApp } from 'vue';
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

export interface Tooltip {
  range: [number, number],
  text: string,
}

export const createTextTooltip = (tooltips: Ref<Array<Tooltip>>) => hoverTooltip((view, pos) => {
  for (const tooltip of tooltips.value) {
    if (pos >= tooltip.range[0] && pos <= tooltip.range[1]) {
      return {
        pos: tooltip.range[0],
        end: tooltip.range[1],
        create: () => {
          const div = document.createElement('div');
          const vue = createApp(LinkedTooltipContent, { text: tooltip.text });
          return { dom: div, mount: () => vue.mount(div), destroy: () => vue.unmount() };
        },
      };
    }
  }
  return null;
});
