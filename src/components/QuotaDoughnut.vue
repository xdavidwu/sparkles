<script lang="ts" setup>
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
// @ts-expect-error Missing type definitions
import colors from 'vuetify/lib/util/colors';

const props = defineProps<{
  used: number,
  total: number,
  title: string,
  details?: { [key: string]: number },
}>();

const percentage = computed(() => ((props.used / props.total) * 100).toFixed(2));

const color = computed(() => {
  if (Number(percentage.value) >= 90) {
    return colors['red']['darken1'];
  } else if (Number(percentage.value) >= 80) {
    return colors['yellow']['darken3'];
  }
  return colors['green']['darken1'];
});

const detailKeys = computed(() => Object.keys(props.details ?? {})
  .sort((a, b) => props.details![a] - props.details![b]));

const chartData = computed(() => ({
  labels: detailKeys.value.concat(['Unused']),
  datasets: [{
    data: detailKeys.value.map((k) => props.details![k]).concat([props.total - props.used]),
    backgroundColor: new Array(detailKeys.value.length).fill(color.value).concat(['#0000']),
    borderColor: new Array(detailKeys.value.length).fill(['#fff7']).concat(['#fff1']),
  }],
}));

// TODO: external tooltip to make it not restricted to canvas?
</script>

<template>
  <div>
    <h4 class="doughnut-title text-center mb-1">{{ title }}</h4>
    <div class="doughnut">
      <div class="doughnut-graph">
        <Doughnut :data="chartData" :options="{
          cutout: '66%',
          plugins: { legend: { display: false } },
        }"/>
      </div>
      <div class="doughnut-text text-center">
        <h2 :style="`color: ${color}`">
          {{ percentage }}%
        </h2>
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.doughnut-title {
  width: 150px;
}

.doughnut {
  width: 150px;
  height: 150px;
  position: relative;
}

.doughnut-graph {
  position: relative;
  z-index: 1;
}

.doughnut-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
