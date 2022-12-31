import { foldService, IndentContext } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

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
