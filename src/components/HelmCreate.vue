<script setup lang="ts">
import { computed, ref } from 'vue';
import { VBtn, VSpacer, VStepper, VTabs } from 'vuetify/components';
import LoadingSuspense from '@/components/LoadingSuspense.vue';
import HelmRepository from '@/components/HelmRepository.vue';
import YAMLEditor from '@/components/YAMLEditor.vue';
import {
  type Chart, type ChartVersion,
  extractValuesSchema, parseTarball, loadChartsFromFiles,
} from '@/utils/helm';
import { PresentedError } from '@/utils/PresentedError';
import { parse } from 'yaml';

const emit = defineEmits<{
  (e: 'apply', chart: Array<Chart>, values: object, name: string): void;
  (e: 'cancel'): void;
}>();

enum Step {
  SELECT_CHART = 1,
  SET_VALUES,
  SET_NAME,
}

const selectedChart = ref<ChartVersion | undefined>();
const parsedChart = ref<Array<Chart> | undefined>();
const step = ref<Step>(Step.SELECT_CHART);
const values = ref('');
const defaults = ref('');
const schema = ref({});
const parsedValues = ref({});

const stepCompleted = computed(() => {
  switch (step.value) {
  case Step.SELECT_CHART:
    return !!selectedChart.value;
  default:
    return true;
  }
});

const steps = [
  { title: 'Select a chart', value: Step.SELECT_CHART },
  { title: 'Set values', value: Step.SET_VALUES },
  { title: 'Name your release', value: Step.SET_NAME },
];

const valuesTabs = [
  { text: 'Values', value: 'values' },
  { text: 'Defaults', value: 'defaults' },
];

const proceed = async (next: () => void) => {
  switch (step.value) {
  case Step.SELECT_CHART:
    {
      // TODO perhaps some loading feedback
      const response = await fetch(selectedChart.value!.urls[0]);
      const files = await parseTarball(response.body!);
      parsedChart.value = await loadChartsFromFiles(files);
      defaults.value = files['values.yaml'] ? await files['values.yaml'].text() : '';
      schema.value = extractValuesSchema(parsedChart.value);
    }
    break;
  case Step.SET_VALUES:
    // TODO prevent on codemirror diag?
    try {
      parsedValues.value = parse(values.value);
    } catch (e) {
      throw new PresentedError(`Invalid YAML input:\n${e}`);
    }
    break;
  }
  next();
};

const apply = () => emit('apply', parsedChart.value!, parsedValues.value, 'test');
</script>

<template>
  <VStepper :items="steps" v-model="step" :disabled="!stepCompleted">
    <template #[`item.${Step.SELECT_CHART}`]>
      <LoadingSuspense>
        <HelmRepository v-model="selectedChart"
          height="calc(100dvh - 48px - 128px)" />
      </LoadingSuspense>
    </template>
    <template #[`item.${Step.SET_VALUES}`]>
      <VTabs :items="valuesTabs">
        <template #[`item.values`]>
          <YAMLEditor v-model="values" :schema="schema"
            :style="`height: calc(100dvh - 48px - 128px - 48px)`" />
        </template>
        <template #[`item.defaults`]>
          <YAMLEditor :model-value="defaults" :key="defaults"
            :style="`height: calc(100dvh - 48px - 128px - 48px)`" disabled />
        </template>
        <!-- TODO schema-based form editor? -->
      </VTabs>
    </template>
    <template #actions="{ prev, next }">
      <div class="d-flex mx-2 mb-2">
        <VBtn v-if="step != 1" variant="text" @click="prev">Back</VBtn>
        <VSpacer />
        <VBtn variant="text" @click="emit('cancel')">Cancel</VBtn>
        <VBtn v-if="step != steps.length" variant="text" color="primary"
          :disabled="!stepCompleted" @click="() => proceed(next)">Continue</VBtn>
        <VBtn v-else variant="text" color="primary" @click="apply">Apply</VBtn>
      </div>
    </template>
  </VStepper>
</template>

<style scoped>
:deep(.v-stepper-window) {
  margin-top: 4px;
  margin-bottom: 8px;
}
</style>
