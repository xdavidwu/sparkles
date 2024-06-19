<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { VStepper } from 'vuetify/components';
import HelmRepository from '@/components/HelmRepository.vue';
import { useAppTabs } from '@/composables/appTabs';
import { type ChartVersion, parseChartTarball } from '@/utils/helm';
import { renderTemplate } from '@/utils/helmWasm';

enum Step {
  SELECT_CHART = 1,
  SET_VALUES,
  SET_NAME,
}

// TODO don't
const { appBarHeightPX } = useAppTabs();

const selectedChart = ref<ChartVersion | undefined>();
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

const load = async (c: ChartVersion) => {
  const response = await fetch(c.urls[0]);
  const chart = await parseChartTarball(response.body!);
  console.log(chart);
  console.log(await renderTemplate(chart, chart[0].values, {
    Name: 'name',
    Namespace: 'namespace',
    Revision: 1,
    IsUpgrade: false,
    IsInstall: true,
  }));
};

watch(selectedChart, () => selectedChart.value && load(selectedChart.value));
</script>

<template>
  <VStepper :items="steps" v-model="step" :disabled="!stepCompleted">
    <template #[`item.${Step.SELECT_CHART}`]>
      <HelmRepository v-model="selectedChart"
        :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px - 132px)`" />
    </template>
  </VStepper>
</template>

<style scoped>
:deep(.v-stepper-window) {
  margin-top: 4px;
  margin-bottom: 8px;
}
</style>
