<script lang="ts" setup>
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  k: string,
  v: string,
  pill?: boolean,
}>(), {
  k: 'key',
  v: 'value',
  pill: false,
});

const baseColors = [
  'red',
  'pink',
  'purple',
  'deep-purple',
  'indigo',
  'blue',
  'light-blue',
  'cyan',
  'teal',
  'green',
  'light-green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'deep-orange',
  'brown',
  'blue-grey',
  'grey',
];

const variants = [
  '-darken-2',
  '-darken-4',
];

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

const fnv1 = (str) => {
  let hash = 0x811c9dc5;
  for (const i in str) {
    hash = hash * 0x01000193;
    hash = Math.abs(hash ^ str.charCodeAt(i));
  }
  return hash;
};

const color = (str) => {
  let hash = fnv1(str);
  const base = baseColors[hash % baseColors.length];
  hash = Math.floor(hash / baseColors.length);
  return `${base}${variants[hash % variants.length]}`;
};

const kColor = computed(() => color(props.k));
const vColor = computed(() => color(props.v));
</script>

<template>
  <div class="d-inline-block" :title="title">
    <span :class="[`rounded-s-${pill ? 'pill' : 'sm'}`, `bg-${kColor}`, 'key']">
      {{ shortK }}
    </span>
    <span :class="[`rounded-e-${pill ? 'pill' : 'sm'}`, `bg-${vColor}`, 'value']">
      {{ shortV }}
    </span>
  </div>
</template>

<style scoped>
div {
  font-weight: normal;
  font-size: 0.75em;
  margin: 0.2em;
}

.key {
  padding-left: 0.4em;
  padding-right: 0.2em;
}

.value {
  padding-left: 0.4em;
  padding-right: 0.5em;
}
</style>
