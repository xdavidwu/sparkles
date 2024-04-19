<script lang="ts" setup>
import LinkedTooltipContent from '@/components/LinkedTooltipContent.vue';
import { computed, createApp } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { type EditorView, hoverTooltip } from '@codemirror/view';
import { yaml } from '@codemirror/lang-yaml';
import { foldEffect, foldable, syntaxTree } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { stateExtensions } from 'codemirror-json-schema';
import { yamlSchemaHover } from 'codemirror-json-schema/yaml';
import { indentFold } from '@/utils/codeMirror';
import { stringify, parseDocument, visit, Scalar, type Node } from 'yaml';
import type { JSONSchema4, JSONSchema7 } from 'json-schema';

interface PathHistoryItem {
  kind: 'YAMLMap' | 'YAMLSeq',
  index: string | number,
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
  data: Object,
  schema?: JSONSchema4,
}>();

const dataAsYAML = computed(() => stringify(props.data));
const parsedBackData = computed(() => parseDocument(dataAsYAML.value));

const codemirrorReady = ({ view }: { view: EditorView }) => {
  const maybeFold = (target: Array<PathHistoryItem>) => {
    let findIndex = 0;
    visit(parsedBackData.value, {
      Pair: (key, node) => {
        if (target[findIndex].kind !== 'YAMLMap') {
          return visit.SKIP;
        }
        if ((node.key as Scalar).value === target[findIndex].index) {
          findIndex++;
          if (findIndex === target.length) {
            const range = foldable(
              view.state,
              (node.key as Node).range![0],
              (node.key as Node).range![1],
            );
            if (range) {
              view.dispatch({effects: foldEffect.of(range)});
            }
            return visit.BREAK;
          }
        } else {
          return visit.SKIP;
        }
      },
      // TODO Seq?
    });
  };
  // inital usage of parsedBackData is slow, either on:
  //  - tooltips (called only on tooltip callback)
  //  - maybeFold
  // hack so that maybeFold does not block rendering
  setTimeout(() => {
    foldOnReady.forEach((path) => {
      maybeFold(path);
    });
  }, 1);
};

const origHover = yamlSchemaHover({
  formatHover: (data) => {
    // XXX: typeInfo does not look great sometime? (allof or object)
    const type = `Type: ${data.typeInfo}`;
    const text = data.message ? `${data.message} ${type}` : type;
    const div = document.createElement('div');
    const vue = createApp(LinkedTooltipContent, { text });
    vue.mount(div);
    return div;
  }
});

// TODO use cm yaml native folding
const extensions = [oneDark, yaml(), indentFold];

if (props.schema) {
  extensions.push(
    hoverTooltip(async (view, pos, side) => {
      const h = await origHover(view, pos, side);
      if (!h) {
        return null;
      }
      // arrow makes tooltip itself hard to hover
      const tree = syntaxTree(view.state);
      const node = tree.resolve(h.pos);
      return { ...h, pos: node.from, end: node.to, arrow: false };
    }),
    // XXX: actually the lib uses Draft04?
    stateExtensions(props.schema as JSONSchema7),
  );
}
</script>

<template>
  <Codemirror v-model="dataAsYAML" :extensions="extensions" @ready="codemirrorReady" />
</template>

<style>
.cm-tooltip {
  z-index: 10000 !important;
}

@media(min-width: 960px) {
  .cm-tooltip {
    max-width: calc(100vw - 256px - 64px);
  }
}
</style>
