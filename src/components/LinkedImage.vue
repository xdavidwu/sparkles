<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  image: string,
}>();

const url = computed(() => {
  // https://github.com/opencontainers/distribution-spec/blob/main/spec.md
  const nameTagRegExp = /^(?<image>[a-z0-9]+((\.|_|__|-+)[a-z0-9]+)*(\/[a-z0-9]+((\.|_|__|-+)[a-z0-9]+)*)*)(:(?<tag>[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}))?$/;
  let match = props.image.match(nameTagRegExp);

  let host;
  let image;
  if (!match) {
    // possibly with host:port on first part?
    const firstslash = props.image.indexOf('/');
    if (firstslash === -1) {
      return null;
    }

    host = props.image.slice(0, firstslash);
    match = props.image.slice(firstslash + 1).match(nameTagRegExp);
    if (!match) {
      return null;
    }
    image = match.groups!.image;
  } else {
    const firstslash = match.groups!.image.indexOf('/');

    if (firstslash === -1) {
      host = 'docker.io';
      image = `library/${match.groups!.image}`;
    } else {
      host = match.groups!.image.slice(0, firstslash);
      // TODO better name validation?
      if (host.indexOf('.') === -1) {
        host = 'docker.io';
        image = match.groups!.image;
      } else {
        image = match.groups!.image.slice(firstslash + 1);
      }
    }
  }
  const tagTail = match.groups!.tag ? `:${match.groups!.tag}` : '';

  switch (host) {
    case 'docker.io':
      return `https://hub.docker.com/r/${image}`;
    case 'public.ecr.aws':
      return `https://gallery.ecr.aws/${image}`;
    case 'registry.k8s.io':
    case 'k8s.gcr.io':
      return `https://us-central1-docker.pkg.dev/k8s-artifacts-prod/images/${image}${tagTail}`;
    case 'quay.io':
    case 'gcr.io':
    case 'ghcr.io':
    case 'cgr.dev': // to source code, not an image catalog
    case host.match(/.-docker\.pkg\.dev$/)?.input:
      return `https://${host}/${image}${tagTail}`;
    default:
      // we don't actually know if it is https or http /shrug
      return match.groups!.tag ?
        `https://${host}/v2/${image}/manifests/${match.groups!.tag}` :
        `https://${host}/v2/${image}/tags/list`;
  }
});
</script>

<template>
  <a v-if="url" :href="url" target="_blank">{{ image }}</a>
  <span v-else>{{ image }}</span>
</template>
