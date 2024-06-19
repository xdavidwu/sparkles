<script setup lang="ts">
import { VCard, VChip, VDataIterator, VTextField } from 'vuetify/components';
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useHelmRepository } from '@/stores/helmRepository';
import { BaseColor, ColorVariant, colorToClass, hashColor } from '@/utils/colors';
import type { ChartVersion } from '@/utils/helm';

const props = defineProps<{
  modelValue?: ChartVersion;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', chart?: ChartVersion): void;
}>();

const store = useHelmRepository();
const { charts } = storeToRefs(store);
const selectedChart = ref<Array<ChartVersion>>(props.modelValue ? [props.modelValue] : []);
const search = ref('');

await store.ensureIndex;

const baseColors = Object.values(BaseColor);
const variants = [ ColorVariant.Lighten3 ];

const chipColor = (s: string) => colorToClass(hashColor(s, baseColors, variants));

watch(selectedChart, () => {
  emit('update:modelValue', selectedChart.value[0]);
});
</script>

<template>
  <!-- TODO seems to need some performance work -->
  <VDataIterator :items="charts" items-per-page="-1" :search="search"
    v-model="selectedChart" select-strategy="single" return-object
    :filter-keys="['name', 'keywords', 'description']" class="overflow-y-auto">
    <template #header>
      <VTextField v-model="search" placeholder="Search"
        class="position-sticky top-0" style="z-index: 1"
        prepend-inner-icon="mdi-magnify" variant="solo" density="compact"
        clearable hide-details />
    </template>
    <template #no-data><div class="mt-2 ms-2">No matches</div></template>
    <template #default="{ items, toggleSelect, isSelected }">
      <VCard v-for="item in items" :key="item.raw.name"
        :prepend-avatar="item.raw.icon" :class="{ selected: isSelected(item) }"
        :subtitle="`Chart version: ${item.raw.version}, App version: ${item.raw.appVersion}`"
        class="mt-2" density="compact" @click="() => toggleSelect(item)">
        <template #title>
          {{ item.raw.name }}
          <VChip v-for="keyword in item.raw.keywords" :key="keyword"
            :color="chipColor(keyword)" size="x-small" class="ml-1">
            {{ keyword }}
          </VChip>
        </template>
        <template #text>{{ item.raw.description }}</template>
      </VCard>
    </template>
  </VDataIterator>
</template>

<style scoped>
.selected {
  background: rgba(var(--v-theme-on-surface), calc(0.25 * var(--v-theme-overlay-multiplier)));
}
</style>
