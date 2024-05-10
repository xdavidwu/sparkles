<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  text: string,
}>();

const tokens = computed(() => {
  const tokens = [];

  const paraRegex = new RegExp(/\n\n/, 'gd');
  const processText = (t: string) => {
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

  const linkRegex = new RegExp(/((http:|https:)[^\s]+[^\s.])/, 'gd');
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
  <div class="bg-teal-darken-4 px-2 py-1 text-caption elevation-4 mw-40 text-pre-wrap text-denser">
    <template v-for="(token, i) in tokens">
      <template v-if="token.type == 'plain'">
        {{ token.value }}
      </template>
      <a v-if="token.type == 'link'" :key="i" target="_blank" :href="token.value">
        {{ token.value }}
      </a>
      <div v-if="token.type == 'sep'" :key="i" class="my-2" />
    </template>
  </div>
</template>

<style scoped>
.mw-40 {
  max-width: 40em;
}

.text-denser {
  line-height: 1.6;
}
</style>
