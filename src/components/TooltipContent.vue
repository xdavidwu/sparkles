<script lang="ts" setup>
import { vMarkdown } from '@/directives/vMarkdown';

defineProps<{
  text: string,
  markdown?: boolean,
}>();
</script>

<template>
  <div class="bg-teal-darken-4 px-2 py-1 rounded elevation-1 mw-40 text-caption text-denser">
    <div v-if="markdown" v-markdown="text" class="markdown code-background" />
    <template v-else >{{ text }}</template>
  </div>
</template>

<style scoped>
.mw-40 {
  max-width: 40em;
}

.text-denser {
  line-height: 1.6;
}

.code-background {
  --markdown-code-background: rgba(0, 0, 0, 0.25);
}
</style>
