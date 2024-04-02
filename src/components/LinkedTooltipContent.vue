<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  text: string,
}>();

const tokens = computed(() => {
  const tokens = [];
  const linkRegex = new RegExp(/((http:|https:)[^\s]+[\w])/, 'gd');
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
  <div class="text-white bg-grey-darken-3 px-2 py-1 text-caption mw-40">
    <template v-for="(token, i) in tokens">
      <template v-if="token.type == 'plain'">
        {{ token.value }}
      </template>
      <a v-if="token.type == 'link'" :key="i" target="_blank" :href="token.value">
        {{ token.value }}
      </a>
    </template>
  </div>
</template>

<style scoped>
.mw-40 {
  max-width: 40em;
}
</style>
