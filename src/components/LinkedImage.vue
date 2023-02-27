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
    case 'public.ecr.aws':
      return `https://gallery.ecr.aws/${components.slice(1).join('/')}`;
    case 'registry.k8s.io':
    case 'k8s.gcr.io':
      return `https://us-central1-docker.pkg.dev/k8s-artifacts-prod/images/${components.slice(1).join('/')}`;
    case 'quay.io':
    case 'gcr.io':
    case 'ghcr.io':
    case components[0].match(/.-docker\.pkg\.dev$/)?.input:
      return `https://${components.join('/')}`;
    default:
      return null;
  }
});
</script>

<template>
  <a v-if="url" :href="url" target="_blank">{{ image }}</a>
  <span v-else>{{ image }}</span>
</template>
