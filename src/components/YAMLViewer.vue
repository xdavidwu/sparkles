<script lang="ts" setup>
import { computed, watch } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { StreamLanguage } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentFold, createTextTooltip, type Tooltips } from '@/utils/CodeMirror';
import { stringify, parseDocument, visit, Pair, YAMLMap, YAMLSeq, Scalar, type Node } from 'yaml';
import pointer from 'json-pointer';

const props = defineProps<{
  data: Object,
  schema?: {
    root?: any,
    object: any,
  },
}>();

const dataAsYAML = computed(() => stringify(props.data));

function descriptionFromPath(schema: any, path: Array<any>): string | null | undefined {
  if (schema.$ref) {
    if (schema.$ref[0] === '#') {
      schema = pointer(props.schema!.root, schema.$ref.substring(1));
    } else {
      console.log('Unsupported non-local reference: ', schema.$ref);
    }
  }

  if (path.length === 0) {
    return schema.description as string | undefined;
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

const tooltips: Tooltips = [];

if (props.schema) {
  watch(dataAsYAML, (data) => {
    const doc = parseDocument(data);
    visit(doc, {
      Pair: (key, node, path) => {
        const description = descriptionFromPath(props.schema!.object, [ ...path, node ]);
        if (description) {
          let end = node.value instanceof Scalar ?
            node.value.range![1] : (node.key as Node).range![1];
          tooltips.push({ range: [(node.key as Node).range![0], end], text: description });
        }
      },
      Seq: (key, node, path) => {
        const description = descriptionFromPath(props.schema!.object, [ ...path, node ]);
        if (description) {
          // the first - list mark
          // TODO: locate other - list marks?
          tooltips.push({ range: [node.range![0], node.range![0] + 1], text: description });
        }
      },
    });
  }, { immediate: true });
}

const extensions = [ oneDark, StreamLanguage.define(yaml), indentFold, createTextTooltip(tooltips) ];
</script>

<template>
  <Codemirror v-model="dataAsYAML" :extensions="extensions" disabled />
</template>
