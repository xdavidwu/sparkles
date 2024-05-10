<script lang="ts" setup>
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import { computed } from 'vue';
import { BaseColor, ColorVariant, colorToClass, hashColor } from '@/utils/colors';
import { truncate, truncateStart } from '@/utils/text';

const props = withDefaults(defineProps<{
  k: string,
  v: string,
  pill?: boolean,
}>(), {
  k: 'key',
  v: 'value',
  pill: false,
});

const baseColors = Object.values(BaseColor);

const variants = [ ColorVariant.Lighten2 ];

const title = computed(() => `${props.k}: ${props.v}`);

const shortK = computed(() => {
  const index = props.k.lastIndexOf('/');
  if (index === -1) {
    return truncateStart(props.k, 10);
  } else {
    return `...${props.k.substring(index + 1)}`;
  }
});
const shortV = computed(() => truncate(props.v, 10));

const kColor = computed(() => colorToClass(hashColor(props.k, baseColors, variants)));
const vColor = computed(() => colorToClass(hashColor(props.v, baseColors, variants)));
</script>

<template>
  <div class="d-inline-block text-sm">
    <span :class="[`text-${kColor}`, 'position-relative', 'px-1']">
      {{ shortK }}<span :class="[`rounded-s-${pill ? 'pill' : 'sm'}`,
        'underlay', 'position-absolute',
        'top-0', 'left-0', 'bottom-0', 'right-0']" />
    </span>
    <span :class="[`text-${vColor}`, 'position-relative', 'px-1']">
      {{ shortV }}<span :class="[`rounded-e-${pill ? 'pill' : 'sm'}`,
        'underlay', 'position-absolute',
        'top-0', 'left-0', 'bottom-0', 'right-0']" />
    </span>
    <LinkedTooltip :text="title" activator="parent" />
  </div>
</template>

<style scoped>
.text-sm {
  font-size: 0.625rem;
}

.underlay {
  opacity: var(--v-activated-opacity);
  background-color: currentColor;
}
</style>
