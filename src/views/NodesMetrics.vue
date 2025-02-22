<script lang="ts" setup>
import { computed, ref, onUnmounted, watch } from 'vue';
import { VCard, VRow, VCol, VSwitch } from 'vuetify/components';
import { Line } from 'vue-chartjs';
import type { ChartOptions } from 'chart.js';
import { useIntervalFn } from '@vueuse/core';
import { useApiConfig } from '@/stores/apiConfig';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useApiLoader } from '@/composables/apiLoader';
import {
  CustomObjectsApi, CoreV1Api,
  ResponseError,
  V1NodeFromJSON, type V1Node,
} from '@xdavidwu/kubernetes-client-typescript-fetch';
import { listAndUnwaitedWatch } from '@/utils/watch';
import { BaseColor, ColorVariant, colorToCode } from '@/utils/colors';
import { durationToS } from '@/utils/duration';
import type { KubernetesList, KubernetesObject } from '@/utils/objects';
import { real } from '@ragnarpa/quantity';
import { fromBytes } from '@tsmx/human-readable';

interface Sample {
  cpu: number, mem: number,
  cpuRatio?: number, memRatio?: number,
};

const config = await useApiConfig().getConfig();
const coreApi = new CoreV1Api(config);
const api = new CustomObjectsApi(config);

const timeRange = 60 * 60;
const _nodes = ref<Array<V1Node>>([]);
const nodes = ref<{ [key: string]: { cpu?: number, mem?: number } }>({});
const samples = ref<Array<{ [key: string]: Sample}>>(Array(timeRange).fill(false).map(() => ({})));
const stacked = ref(false);
let latestSample = Math.floor(new Date().valueOf() / 1000);
let capacityAvailable = true;

const { load: loadNodes } = useApiLoader(async (signal) => {
  await listAndUnwaitedWatch(
    _nodes,
    V1NodeFromJSON,
    (opt) => coreApi.listNodeRaw(opt, { signal }),
    (e) => {
      console.log(e);
      useErrorPresentation().pendingToast = `Watching for nodes failed,\npercentage graphs on new nodes will not be available.`;
    },
  );
  watch(_nodes, () => {
    _nodes.value.forEach((n) => {
      nodes.value[n.metadata!.name!] = {
        cpu: real(n.status!.capacity!.cpu)!,
        mem: real(n.status!.capacity!.memory)!,
      };
    });
  }, { immediate: true });
});

try {
  await loadNodes();
} catch (e) {
  capacityAvailable = false;
  if (e instanceof ResponseError && e.response.status === 403) {
    useErrorPresentation().pendingToast = 'Percentage graphs unavailable: Permission denied on nodes info.';
  } else {
    throw e;
  }
}

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

const datasetMetadata = computed(() => Object.fromEntries(Object.keys(nodes.value).map((n, i) => {
  const color = colorToCode({
    color: colors[i % colors.length],
    variant: ColorVariant.Base,
  });
  return [n, {
    label: n,
    backgroundColor: `${color}aa`,
    borderColor: color,
    pointStyle: false as const,
  }];
})));

const chartData = computed(() => ({
  datasets: Object.keys(nodes.value).map((n) => ({
    ...datasetMetadata.value[n],
    data: samples.value.map((s, i) => s[n] !== undefined ? {
      x: (latestSample - samples.value.length + i) * 1000,
      y: 0, // XXX: hack, vue-chartjs assumes Array<number | Point | null>
      ...s[n],
    } : undefined).filter((s) => s !== undefined),
  })),
}));

const chartOptions = computed(() => {
  const common: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
  };
  const res: Array<ChartOptions<'line'>> = [
    {
      plugins: { title: { display: true, text: 'CPU usage' } },
      scales: { x: { type: 'time' }, y: { stacked: stacked.value } },
      parsing: { yAxisKey: 'cpu' },
      datasets: { line: { fill: stacked.value ? 'stack' : false } },
    },
    {
      plugins: { title: { display: true, text: 'Memory usage' } },
      scales: { x: { type: 'time' }, y: { stacked: stacked.value, ticks: { callback: (v) => fromBytes(+v, { mode: 'IEC' }) } } },
      parsing: { yAxisKey: 'mem' },
      datasets: { line: { fill: stacked.value ? 'stack' : false } },
    },
  ];

  if (capacityAvailable) {
    res.push(
      {
        plugins: { title: { display: true, text: 'CPU usage (%)' } },
        scales: { x: { type: 'time' }, y: { ticks: { format: { style: 'percent', notation: 'compact' } } } },
        parsing: { yAxisKey: 'cpuRatio' },
      },
      {
        plugins: { title: { display: true, text: 'Memory usage (%)' } },
        scales: { x: { type: 'time' }, y: { ticks: { format: { style: 'percent', notation: 'compact' } } } },
        parsing: { yAxisKey: 'memRatio' },
      },
    );
  }

  return res.map((r) => ({ ...r, ...common }));
});


const metricsApi = {
  group: 'metrics.k8s.io',
  version: 'v1beta1',
};

type NodeMetrics = KubernetesObject & {
  timestamp: string;
  window: string;
  usage: Record<string, string>;
};

const { load } = useApiLoader(async (signal) => {
  const response = await api.listClusterCustomObject(
    { ...metricsApi, plural: 'nodes' },
    { signal }) as KubernetesList<NodeMetrics>;
  response.items.forEach((i) => {
    const time = Math.floor(new Date(i.timestamp).valueOf() / 1000);
    let index = time - (latestSample - timeRange);
    if (index < 0) {
      return;
    }

    if (index >= timeRange) {
      const room = index - timeRange + 1;
      for (let i = 0; i < room; i++) {
        samples.value.shift();
        samples.value.push({});
      }
      latestSample += room;
      index = time - (latestSample - timeRange);
    }

    const cpu = real(i.usage.cpu)!, mem = real(i.usage.memory)!;
    const metrics: Sample = { cpu, mem };
    nodes.value[i.metadata!.name!] ??= {};
    if (nodes.value[i.metadata!.name!].cpu) {
      metrics.cpuRatio = metrics.cpu / nodes.value[i.metadata!.name!].cpu!;
    }
    if (nodes.value[i.metadata!.name!].mem) {
      metrics.memRatio = metrics.mem / nodes.value[i.metadata!.name!].mem!;
    }
    samples.value[index][i.metadata!.name!] = metrics;

    const d = durationToS(i.window)!;
    for (let j = 1; j < d; j++) {
      index -= 1;
      if (index < 0) {
        return;
      }
      samples.value[index][i.metadata!.name!] = metrics;
    }
  });
});

const { pause } = useIntervalFn(() => {
  load().catch((e) => {
    pause();
    throw e;
  });
}, 5000, { immediateCallback: true });

onUnmounted(pause);
</script>

<template>
  <div class="mb-2" style="display: flow-root">
    <VSwitch v-model="stacked" label="Stacked" class="float-right"
      density="compact" hide-details />
  </div>
  <VRow dense>
    <VCol v-for="(opt, i) in chartOptions" :key="i" cols="12" md="6">
      <VCard><template #text>
        <Line style="height: 250px" :data="chartData" :options="opt" />
      </template></VCard>
    </VCol>
  </VRow>
</template>
