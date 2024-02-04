<script lang="ts" setup>
import { computed } from 'vue';
import { BaseColor, ColorVariant, colorToClass, hashColor } from '@/utils/colors';

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
    return props.k.length > 10 ?
      `...${props.k.substring(props.k.length - 7)}` :
      props.k;
  } else {
    return `...${props.k.substring(index + 1)}`;
  }
});

const shortV = computed(() => props.v.length > 10 ?
  `${props.v.substring(0, 7)}...` : props.v);

const kColor = computed(() => colorToClass(hashColor(props.k, baseColors, variants)));
const vColor = computed(() => colorToClass(hashColor(props.v, baseColors, variants)));
</script>

<template>
  <div class="d-inline-block" :title="title">
    <span :class="[`text-${kColor}`, 'kv']">
      {{ shortK }}<span :class="[`rounded-s-${pill ? 'pill' : 'sm'}`, 'underlay']" />
    </span>
    <span :class="[`text-${vColor}`, 'kv']">
      {{ shortV }}<span :class="[`rounded-e-${pill ? 'pill' : 'sm'}`, 'underlay']" />
    </span>
  </div>
</template>

<style scoped>
div {
  font-weight: normal;
  font-size: 0.75em;
}

.kv {
  padding-left: 0.4em;
  padding-right: 0.4em;
  position: relative;
}

.underlay {
  opacity: var(--v-activated-opacity);
  background-color: currentColor;
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
}
</style>
