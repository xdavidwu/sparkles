<script setup lang="ts">
import { VCard, VChip, VDataIterator, VTextField } from 'vuetify/components';
import { ref } from 'vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { parse } from 'yaml';
import { satisfies } from 'semver';
import { BaseColor, ColorVariant, colorToClass, hashColor } from '@/utils/colors';
import { type ChartVersion, type IndexFile, parseChartTarball } from '@/utils/helm';
import { renderTemplate } from '@/utils/helmWasm';

const repo = `${window.__base_url}charts`;
const useProxy = false;
const indexURL = `${repo}/index.yaml`;

const baseColors = Object.values(BaseColor);
const variants = [ ColorVariant.Lighten3 ];

const chipColor = (s: string) => colorToClass(hashColor(s, baseColors, variants));

const response = await fetch(useProxy ? `https://corsproxy.io?${encodeURIComponent(indexURL)}` : indexURL);
const text = await response.text();
let index: IndexFile;
try {
  index = JSON.parse(text);
} catch {
  index = parse(text);
}

const versionInfo = await useApisDiscovery().getVersionInfo();
const charts = Object.keys(index.entries)
  .map((key) => index.entries[key][0])
  .filter((c) => c.type !== 'library')
  .filter((c) => c.deprecated !== true)
  .filter((c) => c.kubeVersion ? satisfies(versionInfo.gitVersion, c.kubeVersion): true);
charts.forEach((c) => {
  c.keywords?.sort();
});

const search = ref('');

const select = async (c: ChartVersion) => {
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
</script>

<template>
  <!-- TODO seems to need some performance work -->
  <VDataIterator :items="charts" items-per-page="-1" :search="search"
    :filter-keys="['name', 'keywords', 'description']">
    <template #header>
      <VTextField v-model="search" placeholder="Search" class="mb-2"
        prepend-inner-icon="mdi-magnify" variant="solo"
        clearable hide-details />
    </template>
    <template #no-data>No matches</template>
    <template #default="{ items }">
      <VCard v-for="{ raw: chart } in items" :key="chart.name"
        :prepend-avatar="chart.icon"
        :subtitle="`Chart version: ${chart.version}, App version: ${chart.appVersion}`"
        class="mb-2" @click="() => select(chart)">
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
    </template>
  </VDataIterator>
</template>
