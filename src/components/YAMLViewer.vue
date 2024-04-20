<script lang="ts" setup>
import LinkedTooltipContent from '@/components/LinkedTooltipContent.vue';
import { createApp } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { EditorView, hoverTooltip } from '@codemirror/view';
import { yaml } from '@codemirror/lang-yaml';
import { foldEffect, syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { stateExtensions } from 'codemirror-json-schema';
import { yamlSchemaHover } from 'codemirror-json-schema/yaml';
import type { JSONSchema4, JSONSchema7 } from 'json-schema';

// do we want seq here?
interface PathHistoryItem {
  kind: 'YAMLMap',
  index: string,
}

const foldOnReady: Array<Array<PathHistoryItem>> = [
  [
    {kind: 'YAMLMap', index: 'metadata'},
    {kind: 'YAMLMap', index: 'annotations'},
    {kind: 'YAMLMap', index: 'kubectl.kubernetes.io/last-applied-configuration'},
  ],
  [
    {kind: 'YAMLMap', index: 'metadata'},
    {kind: 'YAMLMap', index: 'managedFields'},
  ],
];

const props = defineProps<{
  data: string,
  schema?: JSONSchema4,
}>();

const codemirrorReady = ({ view }: { view: EditorView }) => {
  // XXX?
  view.dispatch({ effects: EditorView.scrollIntoView(0) });

  // XXX
  const tree = ensureSyntaxTree(view.state, view.state.doc.length, 1000);
  if (!tree) {
    return;
  }

  foldOnReady.forEach((target) => {
    let findIndex = 0;
    let abort = false;
    tree.iterate({
      enter: (n) => {
        if (abort) {
          return false;
        }
        if (n.type.name === 'Pair' && target[findIndex].kind === 'YAMLMap') {
          const literal = n.node.firstChild?.firstChild;
          if (literal) {
            const str = view.state.doc.sliceString(literal.from, literal.to);
            if (str === target[findIndex].index) {
              findIndex++;
              if (findIndex === target.length) {
                abort = true;
                view.dispatch({
                  effects: foldEffect.of({
                    from: view.state.doc.lineAt(n.from).to, to: n.to,
                  }) });
                return false;
              }
              return;
            }
          }
          return false;
        }
      }
    });
  });
};

const origHover = yamlSchemaHover({
  formatHover: (data) => {
    // XXX: typeInfo does not look great sometime? (allof or object)
    const type = `Type: ${data.typeInfo}`;
    const text = data.message ? `${data.message}\n${type}` : type;
    const div = document.createElement('div');
    const vue = createApp(LinkedTooltipContent, { text });
    vue.mount(div);
    return div;
  }
});

// disabled set both editable.of(false) and readonly.of(true)
// editable but readonly is still read-only, but making input handling work
// enable editable for cm-native search
const extensions = [oneDark, EditorView.editable.of(true), yaml()];

if (props.schema) {
  extensions.push(
    hoverTooltip(async (view, pos, side) => {
      const h = await origHover(view, pos, side);
      if (!h) {
        return null;
      }
      const tree = syntaxTree(view.state);
      const node = tree.resolveInner(h.pos, side);
      // lib seems to return schema for parent object in this case
      if (node.type.name === 'Pair' || node.type.name === 'BlockMapping') {
        return null;
      }
      // expand to the key if colon, or the node
      const posOverride = node.type.name === ':' ?
        { pos: node.parent?.firstChild?.from ?? h.pos } :
        { pos: node.from, end: node.to };
      // arrow makes tooltip itself hard to hover
      return { ...h, ...posOverride, arrow: false };
    }),
    // XXX: actually the lib uses Draft04?
    stateExtensions(props.schema as JSONSchema7),
  );
}
</script>

<template>
  <Codemirror :model-value="data" :extensions="extensions" @ready="codemirrorReady" disabled />
</template>

<style scoped>
:deep(.cm-tooltip) {
  z-index: 10000 !important;
}
</style>
