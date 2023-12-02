<script lang="ts" setup>
import { computed, ref } from 'vue';
import { VOverlay } from 'vuetify/components';
import { Doughnut } from 'vue-chartjs';
import type { TooltipModel } from 'chart.js';
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

const data = computed(() => props.details ?? { Used: props.used })

const dataKeys = computed(() => Object.keys(data.value)
  .sort((a, b) => data.value[a] - data.value[b]));

const chartData = computed(() => ({
  labels: dataKeys.value.concat(['Unused']),
  datasets: [{
    data: dataKeys.value.map((k) => data.value[k]).concat([props.total - props.used]),
    backgroundColor: new Array(dataKeys.value.length).fill(color.value).concat(['#0000']),
    borderColor: new Array(dataKeys.value.length).fill(['#fff7']).concat(['#fff1']),
  }],
}));

const tooltip = ref<Pick<TooltipModel<'doughnut'>, 'title' | 'body' | 'opacity' | 'caretX' | 'caretY' | 'labelColors'> | null>(null);
const tooltipHandler = (context: { tooltip: TooltipModel<'doughnut'> }) => {
  const pending = {
    title: context.tooltip.title,
    body: context.tooltip.body,
    opacity: context.tooltip.opacity,
    caretX: context.tooltip.caretX,
    caretY: context.tooltip.caretY,
    labelColors: context.tooltip.labelColors,
  };
  // prevent unneeded reactive ping, to avoid dom op + chartjs update loop
  if (JSON.stringify(pending) !== JSON.stringify(tooltip.value)) {
    tooltip.value = pending;
  }
}
</script>

<template>
  <div>
    <h4 class="doughnut-title text-center mb-1">
      {{ title }}
      <VOverlay location-strategy="connected" location="bottom left"
        activator="parent" content-class="pointer-events-none"
        :offset="tooltip ? [tooltip.caretY, -tooltip.caretX] : [0, 0]"
        :scrim= "false" :modelValue="tooltip != null && tooltip.opacity != 0">
        <div class="text-white bg-grey-darken-3 px-2 py-1 text-caption">
          <div v-for="(title, i) in tooltip?.title" :key="i">
            <div>{{ title }}</div>
            <div class="d-flex align-center">
              <div class="legend d-inline-block mr-1"
                :style="{
                  'background-color': tooltip?.labelColors[i].backgroundColor as string,
                  'border-color': tooltip?.labelColors[i].borderColor as string,
                }"></div>
              {{ tooltip?.body[i].lines.join('') }}
            </div>
          </div>
        </div>
      </VOverlay>
    </h4>
    <div class="doughnut">
      <div class="doughnut-graph">
        <Doughnut :data="chartData" :options="{
          cutout: '66%',
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false, external: tooltipHandler },
          },
        }"/>
      </div>
      <div class="doughnut-text text-center">
        <h2 :style="{ color }">
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
}

.doughnut-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.legend {
  width: 12px;
  height: 12px;
  border-width: 1px;
  border-style: solid;
}
</style>

<style>
.pointer-events-none {
  pointer-events: none !important;
}
</style>
