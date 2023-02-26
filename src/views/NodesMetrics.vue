<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Line } from 'vue-chartjs';
import { useApiConfig } from '@/stores/apiConfig';
import { CustomObjectsApi } from '@/kubernetes-api/src';
import { useIntervalFn, type Pausable } from '@vueuse/core';

const timeRange = 60;
const nodes = ref({});
const samples = ref(Array(timeRange).fill({}));
const latestSample = ref(Math.floor(new Date().valueOf() / 1000));

const chartData = computed(() => ({
  labels: samples.value.map((s, i) =>
    new Date((latestSample.value - samples.value.length + i) * 1000).toLocaleTimeString()),
  datasets: Object.keys(nodes.value).map((n) => ({
    label: n,
    backgroundColor: '#000',
    data: samples.value.map((s) => s[n] ?? 0),
  })),
}));

const ready = ref(false);

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
      let ind = time - (latestSample.value - timeRange);
      if (ind < 0) {
        return;
      }

      if (ind >= timeRange) {
        const room = ind - timeRange + 1;
        for (let i = 0; i < room; i++) {
          samples.value.shift();
          samples.value.push({});
        }
        latestSample.value += room;
        ind = time - (latestSample.value - timeRange);
        console.log(ind);
      }

      nodes.value[i.metadata.name] = true;
      samples.value[ind][i.metadata.name] = i.usage.cpu[0];
    });
    ready.value = true;
  }, 10000, { immediateCallback: true });
  stopUpdating = pause;
});

onUnmounted(() => stopUpdating!());
</script>

<template>
  <div style="background: white">
    <Line :data="chartData" v-if="ready" :options="{ animation: false }" />
  </div>
</template>
