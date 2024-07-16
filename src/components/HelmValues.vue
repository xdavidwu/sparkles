<script setup lang="ts">
import { computed } from 'vue';
import { VTabs } from 'vuetify/components';
import MarkdownViewer from '@/components/MarkdownViewer.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import { stringify } from '@/utils/yaml';
import type { Chart, SerializedChart } from '@/utils/helm';
import type { JSONSchema4 } from 'json-schema';

const props = defineProps<{
  height: string;
  schema?: JSONSchema4;
  chart: Array<Chart> | SerializedChart;
  defaults?: string;
  disabled?: boolean;
  prependTabs?: Array<{ text: string, value: string }>,
}>();

const values = defineModel<string>();
const diagnosticCount = defineModel<number>('diagnosticCount');

const textDecoder = new TextDecoder();
const readme = computed(() => {
  if (props.chart instanceof Array) {
    return textDecoder.decode(props.chart[0].files.find((f) => f.name == 'README.md')?.data);
  } else {
    return atob(props.chart.files.find((f) => f.name == 'README.md')?.data ?? '');
  }
});
const defaults = computed(() =>
  props.defaults ? props.defaults :
    stringify(props.chart instanceof Array ? props.chart[0].values : props.chart.values));
const schema = computed(() =>
  props.schema ? props.schema :
  JSON.parse(props.chart instanceof Array ?
    textDecoder.decode(props.chart[0].schema) :
    atob(props.chart.schema ?? '')));

const builtinTabs = [
  { text: 'Values', value: 'values' },
  { text: 'README', value: 'readme' },
  { text: 'Defaults', value: 'defaults' },
];

const tabs = props.prependTabs ? props.prependTabs.concat(builtinTabs) : builtinTabs;
</script>

<template>
  <VTabs :items="tabs">
    <template #[`item.values`]>
      <YAMLEditor v-model="values" :schema="schema"
        :style="`height: calc(${height} - 48px)`" :disabled="disabled" 
        v-model:diagnosticCount="diagnosticCount" />
    </template>
    <template #[`item.readme`]>
      <MarkdownViewer :markdown="readme"
        :style="`height: calc(${height} - 48px)`" />
    </template>
    <template #[`item.defaults`]>
      <YAMLEditor :model-value="defaults" :key="defaults"
        :style="`height: calc(${height} - 48px)`" disabled />
    </template>
    <!-- TODO schema-based form editor? -->
    <template v-for="item in prependTabs" #[`item.${item.value}`]="scope">
      <slot :name="item.value" v-bind="scope"
        :style="`height: calc(${height} - 48px)`" />
    </template>
  </VTabs>
</template>

<style scoped>
/* YAMLEditor popups */
.v-tabs-window {
  overflow: visible !important;
}
</style>
