<script setup lang="ts">
import { computed, ref } from 'vue';
import { VBtn, VSpacer, VStepper } from 'vuetify/components';
import HelmRepository from '@/components/HelmRepository.vue';
import {
  type Chart, type ChartVersion,
  extractValuesSchema, parseChartTarball,
} from '@/utils/helm';

const emit = defineEmits<{
  (e: 'apply', chart: Array<Chart>, values: object, name: string): void;
}>();

enum Step {
  SELECT_CHART = 1,
  SET_VALUES,
  SET_NAME,
}

const selectedChart = ref<ChartVersion | undefined>();
const parsedChart = ref<Array<Chart> | undefined>();
const step = ref<Step>(Step.SELECT_CHART);

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

const proceed = async (next: () => void) => {
  switch (step.value) {
  case Step.SELECT_CHART:
    {
      // TODO perhaps some loading feedback
      const response = await fetch(selectedChart.value!.urls[0]);
      parsedChart.value = await parseChartTarball(response.body!);
      console.log(extractValuesSchema(parsedChart.value));
    }
  }
  next();
};

const apply = () => emit('apply', parsedChart.value!, {}, 'test');
</script>

<template>
  <VStepper :items="steps" v-model="step" :disabled="!stepCompleted">
    <template #[`item.${Step.SELECT_CHART}`]>
      <HelmRepository v-model="selectedChart"
        :style="`height: calc(100dvh - 48px - 128px)`" />
    </template>
    <template #actions="{ prev, next }">
      <div class="d-flex mx-2 mb-2">
        <VBtn v-if="step != 1" variant="text" @click="prev">Back</VBtn>
        <VSpacer />
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
