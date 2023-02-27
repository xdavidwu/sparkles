<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Line } from 'vue-chartjs';
import { useApiConfig } from '@/stores/apiConfig';
import { CustomObjectsApi } from '@/kubernetes-api/src';
import { useIntervalFn, type Pausable } from '@vueuse/core';
import { BaseColor, ColorVariant, colorToCode, hashColor } from '@/utils/colors';
import parseDuration from 'parse-duration';
import { real } from '@ragnarpa/quantity';

const timeRange = 600;
const nodes = ref<{ [key: string]: true }>({});
const samples = ref(Array(timeRange).fill({}));
const latestSample = ref(Math.floor(new Date().valueOf() / 1000));

const datasetMetadata = computed(() => Object.keys(nodes.value).reduce((r, n) => {
  let color = colorToCode(hashColor(n, Object.values(BaseColor), [ColorVariant.Base]));
  r[n] = {
    label: n,
    backgroundColor: color,
    borderColor: color,
    pointStyle: false,
  };
  return r;
}, {} as { [key: string]: any }));

const chartData = computed(() => ({
  datasets: Object.keys(nodes.value).map((n) => ({
    ...datasetMetadata.value[n],
    data: samples.value.map((s, i) => (s[n] !== undefined ? {
      x: (latestSample.value - samples.value.length + i) * 1000,
      y: s[n],
    } : undefined)).filter((s) => s !== undefined),
  })),
}));

let stopUpdating: Pausable['pause'] | null = null;

onMounted(async () => {
  const config = await useApiConfig().getConfig();
  const api = new CustomObjectsApi(config);
  const metricsApi = {
    group: 'metrics.k8s.io',
    version: 'v1beta1',
  };
  const { pause } = useIntervalFn(async () => {
    const sample = await api.listClusterCustomObject({ ...metricsApi, plural: 'nodes'}) as any;
    sample.items.forEach((i: any) => {
      const time = Math.floor(new Date(i.timestamp).valueOf() / 1000);
      let index = time - (latestSample.value - timeRange);
      if (index < 0) {
        return;
      }

      if (index >= timeRange) {
        const room = index - timeRange + 1;
        for (let i = 0; i < room; i++) {
          samples.value.shift();
          samples.value.push({});
        }
        latestSample.value += room;
        index = time - (latestSample.value - timeRange);
      }

      nodes.value[i.metadata.name] ??= true;
      const cpu = real(i.usage.cpu);
      samples.value[index][i.metadata.name] = cpu;

      const d = parseDuration(i.window, 's');
      for (let j = 1; j < d; j++) {
        index -= 1;
        if (index < 0) {
          return;
        }
        samples.value[index][i.metadata.name] = cpu;
      }
    });
  }, 5000, { immediateCallback: true });
  stopUpdating = pause;
});

onUnmounted(() => stopUpdating!());
</script>

<template>
  <Line :data="chartData" :options="{
    animation: false,
    plugins: { title: { display: true, text: 'CPU usage' } },
    scales: { x: { type: 'time' } },
  }" />
</template>
