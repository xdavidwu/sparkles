<script lang="ts" setup>
import { computed } from 'vue';
import { linkRegex } from '@/utils/text';

const props = defineProps<{
  text: string;
}>();

const tokens = computed(() => {
  const tokens = [];

  let currentIndex = 0;
  for (const match of props.text.matchAll(linkRegex)) {
    tokens.push({
      type: 'plain',
      value: props.text.substring(currentIndex, match.indices![0][0]),
    });
    tokens.push({
      type: 'link',
      value: props.text.substring(match.indices![0][0], match.indices![0][1]),
    });
    currentIndex = match.indices![0][1];
  }
  tokens.push({
    type: 'plain',
    value: props.text.substring(currentIndex, props.text.length),
  });
  return tokens;
});
</script>

<template>
  <div class="text-pre-wrap">
    <template v-for="(token, i) in tokens">
      <template v-if="token.type == 'plain'">
        {{ token.value }}
      </template>
      <a v-if="token.type == 'link'" :key="i" target="_blank"
        class="text-break-all" :href="token.value">
        {{ token.value }}
      </a>
    </template>
  </div>
</template>

<style scoped>
.text-break-all {
  word-break: break-all;
}
</style>
