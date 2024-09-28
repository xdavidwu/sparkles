<script setup lang="ts">
import HoverTooltip from '@/components/HoverTooltip.vue';
import { computed } from 'vue';

const props = defineProps<{
  image: string,
  id?: string,
}>();

// TODO investigate real-word use of org.opencontainers.image.url
// see if it is typically used to link to pages about the image or product
// consider supporting it and maybe other annotations

// basically simplified github.com/containers/image/v5/docker/reference.ParseNormalizedNamed?
const url = computed(() => {
  // https://github.com/opencontainers/distribution-spec/blob/main/spec.md
  const nameTagRegExp = /^(?<image>[a-z0-9]+((\.|_|__|-+)[a-z0-9]+)*(\/[a-z0-9]+((\.|_|__|-+)[a-z0-9]+)*)*)(:(?<tag>[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127})|@(?<digest>(?<algorithm>[a-z0-9]+([+._-][a-z0-9]+)*):(?<encoded>[a-zA-Z0-9=_-]+)))?$/;
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
    // github.com/containers/image/v5/docker/reference.splitDockerDomain, without :port
    const firstslash = match.groups!.image.indexOf('/');
    const dockerHub = 'docker.io';

    if (firstslash === -1) {
      host = dockerHub;
      image = match.groups!.image;
    } else {
      host = match.groups!.image.slice(0, firstslash);
      if (host.indexOf('.') === -1 && host != 'localhost') {
        host = dockerHub;
        image = match.groups!.image;
      } else {
        image = match.groups!.image.slice(firstslash + 1);
      }
    }
    if (host == 'index.docker.io') {
      host = dockerHub;
    }
    if (host == dockerHub && image.indexOf('/') === -1) {
      image = `library/${image}`;
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
  <component :is="url ? 'a' : 'span'" :href="url" target="_blank">
    {{ image }}
    <HoverTooltip v-if="id" :text="id" activator="parent" style="word-break: break-all" />
  </component>
</template>
