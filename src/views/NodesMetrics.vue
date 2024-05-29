<script lang="ts" setup>
import { ref, onUnmounted, computed } from 'vue';
import { VCard, VRow, VCol, VSwitch } from 'vuetify/components';
import { Line } from 'vue-chartjs';
import { useApiConfig } from '@/stores/apiConfig';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useAbortController } from '@/composables/abortController';
import { CustomObjectsApi, CoreV1Api, ResponseError } from '@/kubernetes-api/src';
import { useIntervalFn } from '@vueuse/core';
import { BaseColor, ColorVariant, colorToCode } from '@/utils/colors';
import type { KubernetesList } from '@/utils/objects';
import parseDuration from 'parse-duration';
import { real } from '@ragnarpa/quantity';
import { fromBytes } from '@tsmx/human-readable';

const config = await useApiConfig().getConfig();
const coreApi = new CoreV1Api(config);
const api = new CustomObjectsApi(config);

const timeRange = 600;
const nodes = ref<{ [key: string]: { cpu?: number, mem?: number } }>({});
const samples = ref<Array<{
  [key: string]: { cpu: number, mem: number, cpuPercentage?: number, memPercentage?: number }
}>>(Array(timeRange).fill(false).map(() => ({})));
const latestSample = ref(Math.floor(new Date().valueOf() / 1000));
const capacityAvailable = ref(false);
const stacked = ref(false);
const { abort: abortRequests, signal } = useAbortController();

const colors = [
  BaseColor.Red,
  BaseColor.Purple,
  BaseColor.LightBlue,
  BaseColor.Teal,
  BaseColor.LightGreen,
  BaseColor.Yellow,
  BaseColor.Orange,
  BaseColor.Brown,
  BaseColor.Grey,
];

const datasetMetadata = computed(() => Object.keys(nodes.value).reduce((r, n, i) => {
  let color = colorToCode({
    color: colors[i % colors.length],
    variant: ColorVariant.Base,
  });
  r[n] = {
    label: n,
    backgroundColor: `${color}aa`,
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
      ...s[n],
    } : undefined)).filter((s) => s !== undefined),
  })),
}));

try {
  (await coreApi.listNode()).items.forEach((n) => {
    nodes.value[n.metadata!.name!] = {
      cpu: real(n.status!.capacity!.cpu)!,
      mem: real(n.status!.capacity!.memory)!,
    };
  });
  capacityAvailable.value = true;
} catch (e) {
  if (e instanceof ResponseError && e.response.status === 403) {
    useErrorPresentation().pendingToast = 'Percentage graphs unavailable: Permission denied on nodes info.';
  } else {
    throw e;
  }
}

const metricsApi = {
  group: 'metrics.k8s.io',
  version: 'v1beta1',
};
const { pause } = useIntervalFn(() => {
  (async () => {
    abortRequests();
    const response = await api.listClusterCustomObject(
      { ...metricsApi, plural: 'nodes' },
      { signal: signal.value }) as KubernetesList<any>;
    response.items.forEach((i: any) => {
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

      const cpu = real(i.usage.cpu)!, mem = real(i.usage.memory)!;
      const metrics = capacityAvailable.value ? {
        cpu,
        mem,
        cpuPercentage: cpu / nodes.value[i.metadata.name].cpu! * 100,
        memPercentage: mem / nodes.value[i.metadata.name].mem! * 100,
      } : { cpu, mem };
      nodes.value[i.metadata.name] ??= {};
      samples.value[index][i.metadata.name] = metrics;

      const d = parseDuration(i.window, 's')!;
      for (let j = 1; j < d; j++) {
        index -= 1;
        if (index < 0) {
          return;
        }
        samples.value[index][i.metadata.name] = metrics;
      }
    });
  })().catch((e) => {
    useErrorPresentation().pendingError = e;
    pause();
  });
}, 5000, { immediateCallback: true });

onUnmounted(pause);
</script>

<template>
  <div class="overflow-hidden">
    <VSwitch v-model="stacked" label="Stacked" hide-details class="float-right" />
  </div>
  <VRow>
    <VCol cols="12" md="6">
      <VCard><template #text>
        <Line style="height: 250px" :data="chartData" :options="{
            responsive: true, maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'CPU usage' } },
            scales: { x: { type: 'time' }, y: { stacked } },
            parsing: { yAxisKey: 'cpu' },
            datasets: { line: { fill: stacked ? 'stack' : false } },
          }" />
      </template></VCard>
    </VCol>
    <VCol cols="12" md="6">
      <VCard><template #text>
        <Line style="height: 250px" :data="chartData" :options="{
            responsive: true, maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Memory usage' } },
            scales: { x: { type: 'time' }, y: { ticks: { callback: (v) => fromBytes(+v, { mode: 'IEC' }) }, stacked } },
            parsing: { yAxisKey: 'mem' },
            datasets: { line: { fill: stacked ? 'stack' : false } },
          }" />
      </template></VCard>
    </VCol>
    <template v-if="capacityAvailable">
      <VCol cols="12" md="6">
        <VCard><template #text>
          <Line style="height: 250px" :data="chartData" :options="{
              responsive: true, maintainAspectRatio: false,
              plugins: { title: { display: true, text: 'CPU usage (%)' } },
              scales: { x: { type: 'time' }, y: { ticks: { callback: (v) => `${v}%` } } },
              parsing: { yAxisKey: 'cpuPercentage' },
            }" />
        </template></VCard>
      </VCol>
      <VCol cols="12" md="6">
        <VCard><template #text>
          <Line style="height: 250px" :data="chartData" :options="{
              responsive: true, maintainAspectRatio: false,
              plugins: { title: { display: true, text: 'Memory usage (%)' } },
              scales: { x: { type: 'time' }, y: { ticks: { callback: (v) => `${v}%` } } },
              parsing: { yAxisKey: 'memPercentage' },
            }" />
        </template></VCard>
      </VCol>
    </template>
  </VRow>
</template>
