<script lang="ts" setup>
import { computed } from 'vue';
import { linkRegex } from '@/utils/text';

const props = withDefaults(defineProps<{
  text: string;
  tag?: string;
  paragraph?: boolean;
}>(), {
  tag: 'pre',
});

const tokens = computed(() => {
  const tokens = [];

  const paraRegex = new RegExp(/\n\n/, 'gd');
  const processText = (t: string) => {
    if (!props.paragraph) {
      tokens.push({
        type: 'plain',
        value: t,
      });
      return;
    }
    let currentIndex = 0;
    for (const match of t.matchAll(paraRegex)) {
      tokens.push({
        type: 'plain',
        value: t.substring(currentIndex, match.indices![0][0]),
      });
      tokens.push({
        type: 'sep',
        value: '',
      });
      currentIndex = match.indices![0][1];
    }
    tokens.push({
      type: 'plain',
      value: t.substring(currentIndex, t.length),
    });
  }

  let currentIndex = 0;
  for (const match of props.text.matchAll(linkRegex)) {
    processText(props.text.substring(currentIndex, match.indices![0][0]));
    tokens.push({
      type: 'link',
      value: props.text.substring(match.indices![0][0], match.indices![0][1]),
    });
    currentIndex = match.indices![0][1];
  }
  processText(props.text.substring(currentIndex, props.text.length));
  return tokens;
});
</script>

<template>
  <component :is="tag" class="text-pre-wrap">
    <template v-for="(token, i) in tokens">
      <template v-if="token.type == 'plain'">
        {{ token.value }}
      </template>
      <a v-if="token.type == 'link'" :key="i" target="_blank"
        class="text-break-all" :href="token.value">
        {{ token.value }}
      </a>
      <div v-if="token.type == 'sep'" :key="i" class="my-2" />
    </template>
  </component>
</template>

<style scoped>
.text-break-all {
  word-break: break-all;
}
</style>
