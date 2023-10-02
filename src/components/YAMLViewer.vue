<script lang="ts" setup>
import { computed } from 'vue';
import { Codemirror } from 'vue-codemirror';
import type { EditorView } from '@codemirror/view';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { StreamLanguage, foldEffect, foldable } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentFold, createTextTooltip, type Tooltips } from '@/utils/codeMirror';
import { stringify, parseDocument, visit, Pair, YAMLMap, YAMLSeq, Scalar, type Node } from 'yaml';
import pointer from 'json-pointer';

type pathHistoryItem = {
  kind: 'YAMLMap' | 'YAMLSeq',
  index: string | number,
};

const foldOnReady: Array<Array<pathHistoryItem>> = [
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
  schema?: {
    root?: any,
    object: any,
  },
}>();

const dataAsYAML = computed(() => stringify(props.data));
const parsedBackData = computed(() => parseDocument(dataAsYAML.value));

function descriptionFromPath(schema: any, path: Array<any>): string | null | undefined {
  if (schema.$ref) {
    if (schema.$ref[0] === '#') {
      schema = pointer(props.schema!.root, schema.$ref.substring(1));
    } else {
      console.log('Unsupported non-local reference: ', schema.$ref);
    }
  }

  if (path.length === 0) {
    let res = schema.description as string | undefined;
    if (schema.title) {
      res = `${schema.title}:\n${res ?? ''}`;
    }
    return res;
  }

  if (path[0] instanceof Pair) {
    const key = path[0].key.value;
    if (schema.properties?.[key]) {
      schema = schema.properties?.[key];
    } else {
      return null
    }
  } else if (path[0] instanceof YAMLMap) {
    // XXX: why kubernetes uses allOf everywhere?
    // take this chance to hack out allOf
    if (schema.allOf) {
      schema = schema.allOf[0];
    }
  } else if (path[0] instanceof YAMLSeq) {
    if (schema.items) {
      schema = schema.items;
    } else {
      return null;
    }
  }

  return descriptionFromPath(schema, path.slice(1));
}

const tooltips = computed(() => {
  if (!props.schema) {
    return [];
  }
  const tips: Tooltips = [];
  visit(parsedBackData.value, {
    Pair: (key, node, path) => {
      const description = descriptionFromPath(props.schema!.object, [ ...path, node ]);
      if (description) {
        let end = node.value instanceof Scalar ?
          node.value.range![1] : (node.key as Node).range![1];
        tips.push({ range: [(node.key as Node).range![0], end], text: description });
      }
    },
    Seq: (key, node, path) => {
      const description = descriptionFromPath(props.schema!.object, [ ...path, node ]);
      if (description) {
        // the first - list mark
        // TODO: locate other - list marks?
        tips.push({ range: [node.range![0], node.range![0] + 1], text: description });
      }
    },
  });
  return tips;
});

const codemirrorReady = ({ view }: { view: EditorView }) => {
  const maybeFold = (target: Array<pathHistoryItem>) => {
    let findIndex = 0;
    visit(parsedBackData.value, {
      Pair: (key, node) => {
        if (target[findIndex].kind !== 'YAMLMap') {
          return visit.SKIP;
        }
        if ((node.key as Scalar).value === target[findIndex].index) {
          findIndex++;
          if (findIndex === target.length) {
            view.dispatch({effects: foldEffect.of(foldable(
              view.state,
              (node.key as Node).range![0],
              (node.key as Node).range![1],
            )!)})
            return visit.BREAK;
          }
        } else {
          return visit.SKIP;
        }
      },
      // TODO Seq?
    });
  };
  foldOnReady.forEach((path) => {
    maybeFold(path);
  })
};

const extensions = [ oneDark, StreamLanguage.define(yaml), indentFold, createTextTooltip(tooltips) ];
</script>

<template>
  <Codemirror v-model="dataAsYAML" :extensions="extensions" @ready="codemirrorReady" disabled />
</template>
