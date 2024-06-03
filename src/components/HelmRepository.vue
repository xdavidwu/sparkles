<script setup lang="ts">
import { VCard, VChip } from 'vuetify/components';
import { ref, onMounted } from 'vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { parse } from 'yaml';
import { satisfies } from 'semver';
import { BaseColor, ColorVariant, colorToClass, hashColor } from '@/utils/colors';
import { type ChartVersion, type IndexFile, parseChartTarball } from '@/utils/helm';

const repo = `${window.__base_url}charts`;
const useProxy = false;
const indexURL = `${repo}/index.yaml`;

const baseColors = Object.values(BaseColor);
const variants = [ ColorVariant.Lighten3 ];

const charts = ref<Array<ChartVersion>>([]);

const chipColor = (s: string) => colorToClass(hashColor(s, baseColors, variants));

onMounted(async () => {
  const response = await fetch(useProxy ? `https://corsproxy.io?${encodeURIComponent(indexURL)}` : indexURL);
  const text = await response.text();
  let index: IndexFile;
  try {
    index = JSON.parse(text);
  } catch {
    index = parse(text);
  }

  const versionInfo = await useApisDiscovery().getVersionInfo();
  const repoCharts = Object.keys(index.entries)
    .map((key) => index.entries[key][0])
    .filter((c) => c.type !== 'library')
    .filter((c) => c.deprecated !== true)
    .filter((c) => c.kubeVersion ? satisfies(versionInfo.gitVersion, c.kubeVersion): true);
  repoCharts.forEach((c) => {
    c.keywords?.sort();
  })
  charts.value = repoCharts;
})

const select = async (c: ChartVersion) => {
  const response = await fetch(c.urls[0]);
  console.log(await parseChartTarball(response.body!));
};
</script>

<template>
  <div>
    <VCard v-for="chart in charts" :key="chart.name"
      :prepend-avatar="chart.icon"
      :subtitle="`Chart version: ${chart.version}, App version: ${chart.appVersion}`"
      class="mb-4" @click="() => select(chart)">
      <template #title>
        {{ chart.name }}
        <VChip v-for="keyword in chart.keywords" :key="keyword"
          :color="chipColor(keyword)"
          size="x-small" class="ml-1">
          {{ keyword }}
        </VChip>
      </template>
      <template #text>{{ chart.description }}</template>
    </VCard>
  </div>
</template>
