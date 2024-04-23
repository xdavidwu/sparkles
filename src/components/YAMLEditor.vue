<script lang="ts" setup>
import LinkedTooltipContent from '@/components/LinkedTooltipContent.vue';
import { createApp, computed } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView, hoverTooltip } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import { yaml, yamlLanguage } from '@codemirror/lang-yaml';
import { foldEffect, syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { stateExtensions } from 'codemirror-json-schema';
import { yamlSchemaHover, yamlCompletion } from 'codemirror-json-schema/yaml';
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

const props = withDefaults(defineProps<{
  disabled?: boolean,
  schema?: JSONSchema4,
}>(), {
  disabled: false,
});

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

const tooltipExtension = hoverTooltip(async (view, pos, side) => {
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
});

const extensions = computed(() => {
  const e = [
    oneDark,
    // editable but readonly is still read-only, but making input handling work
    // always enable editable for cm-native search
    EditorView.editable.of(true), EditorState.readOnly.of(props.disabled),
    yaml(),
  ];

  if (!props.disabled) {
    e.push(autocompletion({
      // TODO: no bring-your-own-tooltip,
      // need to align it with LinkedTooltipContent as close as possible
      // XXX: default stying feels reversed on selection
      tooltipClass: () => 'text-caption elevation-4',
    }));
  }

  if (props.schema) {
    if (!props.disabled) {
      e.push(yamlLanguage.data.of({ autocomplete: yamlCompletion() }));
    }

    e.push(tooltipExtension, stateExtensions(props.schema as JSONSchema7));
  }

  return e;
});
</script>

<template>
  <Codemirror :extensions="extensions" @ready="codemirrorReady" />
</template>

<style scoped>
:deep(.cm-tooltip) {
  z-index: 10000 !important;
}
</style>
