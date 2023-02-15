<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  image: string,
}>();

const url = computed(() => {
  const components = props.image.split(':')[0].split('/');

  // normalization
  if (components.length >= 2 && components[0].indexOf('.') === -1) {
    components.unshift('docker.io');
  } else if (components.length === 1) {
    components.unshift('docker.io', 'library');
  }

  switch (components[0]) {
    case 'docker.io':
      return `https://hub.docker.com/r/${components.slice(1).join('/')}`;
    case 'quay.io':
      return `https://quay.io/repository/${components.slice(1).join('/')}`;
    default:
      return null;
  }
});
</script>

<template>
  <a v-if="url" :href="url" target="_blank">{{ image }}</a>
  <template v-else>{{ image }}</template>
</template>
