<script lang="ts" setup>
import { VOverlay } from 'vuetify/components';
import { Doughnut } from 'vue-chartjs';
import TooltipContent from '@/components/TooltipContent.vue';
import { computed, ref } from 'vue';
import type { TooltipModel } from 'chart.js';
import colors from 'vuetify/util/colors';

const props = defineProps<{
  used: number,
  total: number,
  title: string,
  details?: { [key: string]: number },
}>();

const percentage = computed(() => (props.used / props.total) * 100);
const percentageText = computed(() => props.total ? `${percentage.value.toFixed(2)}%` : 'None allowed');

const color = computed(() => {
  if (percentage.value >= 90 || !props.total) {
    return colors['red']['darken1'];
  } else if (percentage.value >= 80) {
    return colors['yellow']['darken3'];
  }
  return colors['green']['darken1'];
});

const data = computed(() => props.details ?? { Used: props.used })

const chartData = computed(() => {
  const items = Object.entries(data.value).sort((a, b) => a[1] - b[1]);

  return {
    labels: items.map(([k]) => k).concat(['Unused']),
    datasets: [{
      data: items.map(kv => kv[1]).concat([Math.max(props.total - props.used, 0)]),
      backgroundColor: items.map(() => color.value).concat(['#0000']),
      borderColor: items.map(() => '#fff7').concat(['#fff1']),
      hoverBorderColor: items.map(() => '#fffc').concat(['#fff2']),
    }],
  };
});

const tooltip = ref<Pick<TooltipModel<'doughnut'>, 'title' | 'body' | 'opacity' | 'caretX' | 'caretY' | 'labelColors'> | undefined>();
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
};
</script>

<template>
  <div>
    <h4 class="doughnut-title text-center text-pre-wrap mb-2">
      {{ title }}
      <!-- 2 to mimic caretPadding -->
      <VOverlay location-strategy="connected" location="bottom left"
        activator="parent" content-class="pointer-events-none"
        :offset="tooltip ? [tooltip.caretY + 2, -(tooltip.caretX + 2)] : [0, 0]"
        :scrim="false" :modelValue="tooltip && tooltip.opacity != 0">
        <TooltipContent>
          <div v-for="(title, i) in tooltip!.title" :key="i">
            <div>{{ title }}</div>
            <div class="d-flex align-center">
              <div class="d-inline-block mr-1 legend-bg">
                <div class="legend" :style="{
                  'background-color': tooltip!.labelColors[i]!.backgroundColor as string,
                  'border-color': tooltip!.labelColors[i]!.borderColor as string,
                }" />
              </div>
              {{ tooltip!.body[i]!.lines.join('') }}
            </div>
          </div>
        </TooltipContent>
      </VOverlay>
    </h4>
    <div class="doughnut">
      <div class="doughnut-graph">
        <Doughnut v-if="props.total" :data="chartData" :options="{
          cutout: '66%',
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false, external: tooltipHandler },
          },
        }"/>
      </div>
      <div class="doughnut-text text-center">
        <h2 :style="{ color }">
          {{ percentageText }}
        </h2>
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.doughnut-title {
  width: 174px;
}

.doughnut {
  margin: 0 12px;
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

.legend-bg {
  background-color: rgb(var(--v-theme-surface));
}

:deep(.pointer-events-none) {
  pointer-events: none !important;
}
</style>
