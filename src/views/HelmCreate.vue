<script setup lang="ts">
import { ref, watch } from 'vue';
import { VStepper } from 'vuetify/components';
import HelmRepository from '@/components/HelmRepository.vue';
import { useAppTabs } from '@/composables/appTabs';
import { type ChartVersion, parseChartTarball } from '@/utils/helm';
import { renderTemplate } from '@/utils/helmWasm';

// TODO don't
const { appBarHeightPX } = useAppTabs();

// FIXME make it single
const selectedChart = ref<Array<ChartVersion> | undefined>();

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

watch(selectedChart, () => selectedChart.value && load(selectedChart.value[0]));
</script>

<template>
  <VStepper :items="['Select a chart', 'Set values', 'Name your release']">
    <template #[`item.1`]>
      <HelmRepository v-model="selectedChart"
        :style="`height: calc(100dvh - ${appBarHeightPX}px - 32px - 132px)`" />
    </template>
  </VStepper>
</template>
