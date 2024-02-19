<script setup lang="ts">
import { VCard, VCardText, VCardTitle, VChip } from 'vuetify/components';
import { ref, onMounted } from 'vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { parse } from 'yaml';
import { satisfies } from 'semver';
import { BaseColor, ColorVariant, colorToClass, hashColor } from '@/utils/colors';

const repo = `${import.meta.env.BASE_URL}charts`;
const useProxy = false;
const indexURL = `${repo}/index.yaml`;

const baseColors = Object.values(BaseColor);
const variants = [ ColorVariant.Lighten3 ];

const charts = ref<Array<any>>([]);

const chipColor = (s: string) => colorToClass(hashColor(s, baseColors, variants));

onMounted(async () => {
  const response = await fetch(useProxy ? `https://corsproxy.io?${encodeURIComponent(indexURL)}` : indexURL);
  const text = await response.text();
  let index: any;
  try {
    index = JSON.parse(text);
  } catch {
    index = parse(text);
  }

  const versionInfo = await useApisDiscovery().getVersionInfo();
  const repoCharts = Object.keys(index.entries)
    .map((key) => index.entries[key][0])
    .filter((c: any) => c.type !== 'library')
    .filter((c: any) => c.deprecated !== true)
    .filter((c: any) => c.kubeVersion ? satisfies(versionInfo.gitVersion, c.kubeVersion): true);
  repoCharts.forEach((c: any) => {
    c.keywords?.sort();
  })
  charts.value = repoCharts;
})
</script>

<template>
  <div>
    <VCard v-for="chart in charts" :key="chart.name"
      :prepend-avatar="chart.icon"
      :subtitle="`Chart version: ${chart.version}, App version: ${chart.appVersion}`"
      class="mb-4">
      <template #title>
        <VCardTitle>
          {{ chart.name }}
          <VChip v-for="keyword in chart.keywords" :key="keyword"
            :color="chipColor(keyword)"
            size="x-small" class="ml-1">
            {{ keyword }}
          </VChip>
        </VCardTitle>
      </template>
      <VCardText>{{ chart.description }}</VCardText>
    </VCard>
  </div>
</template>
