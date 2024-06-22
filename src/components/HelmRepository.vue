<script setup lang="ts">
import { VCard, VChip, VDataIterator, VDivider, VTextField, VVirtualScroll } from 'vuetify/components';
import { ref, watch, readonly } from 'vue';
import { storeToRefs } from 'pinia';
import { useHelmRepository } from '@/stores/helmRepository';
import { BaseColor, ColorVariant, colorToClass, hashColor } from '@/utils/colors';
import type { ChartVersion } from '@/utils/helm';

const props = defineProps<{
  modelValue?: ChartVersion;
  height?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', chart?: ChartVersion): void;
}>();

const baseColors = Object.values(BaseColor);
const variants = [ ColorVariant.Lighten3 ];

const store = useHelmRepository();
const { charts: _charts } = storeToRefs(store);

await store.ensureIndex;

// readonly needed for selection to work
const charts = readonly(await Promise.all(_charts.value.map(async (c) => ({
  ...c,
  keywords: c.keywords ?
    await Promise.all(c.keywords.map(async (text) => ({
        text,
        color: colorToClass(await hashColor(text, baseColors, variants)),
      }),
    )) : [],
}))));
const selectedChart = ref<Array<ChartVersion>>(props.modelValue ? [props.modelValue] : []);
const search = ref('');

watch(selectedChart, () => {
  emit('update:modelValue', selectedChart.value[0]);
});
</script>

<template>
  <VDataIterator :items="charts" items-per-page="-1" :search="search"
    v-model="selectedChart" select-strategy="single" return-object
    :filter-keys="['name', 'keywords', 'description']" :style="`height: ${height}`">
    <template #header>
      <VTextField v-model="search" placeholder="Search"
        class="position-sticky top-0 mb-1" style="z-index: 1"
        prepend-inner-icon="mdi-magnify" variant="solo" density="compact"
        clearable hide-details />
    </template>
    <template #no-data><div class="mt-2 ms-4">No matches</div></template>
    <template #default="{ items, toggleSelect, isSelected }">
      <VVirtualScroll :items="items" :height="`calc(${height} - 44px)`">
        <template #default="{ item, index }">
          <VDivider v-if="index" />
          <VCard :prepend-avatar="item.raw.icon"
            :class="{ selected: isSelected(item) }"
            :subtitle="`Chart version: ${item.raw.version}, App version: ${item.raw.appVersion}`"
            density="compact" flat @click="() => toggleSelect(item)">
            <template #title>
              {{ item.raw.name }}
              <VChip v-for="keyword in item.raw.keywords" :key="keyword.text"
                :color="keyword.color" size="x-small" class="ml-1">
                {{ keyword.text }}
              </VChip>
            </template>
            <template #text>
              <span class="text-medium-emphasis">{{ item.raw.description }}</span>
            </template>
          </VCard>
        </template>
      </VVirtualScroll>
    </template>
  </VDataIterator>
</template>

<style scoped>
.selected {
  background: rgba(var(--v-theme-on-surface), calc(0.25 * var(--v-theme-overlay-multiplier)));
}
</style>
