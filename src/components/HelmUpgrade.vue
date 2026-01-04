<script setup lang="ts">
import { ref } from 'vue';
import { VBtn, VCard } from 'vuetify/components';
import HelmValues from '@/components/HelmValues.vue';
import { parseInput, stringify } from '@/utils/yaml';
import {
  type ChartVersion, type DeserialzedChart, type Release,
  extractValuesSchema, loadChartsFromFiles, parseTarball,
} from '@/utils/helm';

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'upgrade', chart: DeserialzedChart, values: object, release: Release): void;
}>();

const props = defineProps<{
  from: Release;
  to: ChartVersion;
}>();

const values = ref(stringify(props.from.config ?? {}));
const diagnosticCount = ref(0);

const response = await fetch(props.to.urls[0]);
const files = await parseTarball(response.body!);
const chart = await loadChartsFromFiles(files);
const defaults = files['values.yaml'] ? await files['values.yaml'].text() : '';
const schema = extractValuesSchema(chart);

const upgrade = () =>
  emit('upgrade', chart, parseInput(values.value), props.from);
</script>

<template>
  <VCard>
    <template #text>
      <div class="mb-n6">
        <HelmValues height="calc(100dvh - 48px - 116px)" v-model="values"
          v-model:diagnosticCount="diagnosticCount"
          :chart="chart" :defaults="defaults" :schema="schema" />
      </div>
    </template>
    <template #actions>
      <VBtn @click="emit('cancel')">Cancel</VBtn>
      <VBtn color="primary" :disabled="!!diagnosticCount" @click="upgrade">Apply</VBtn>
    </template>
  </VCard>
</template>
