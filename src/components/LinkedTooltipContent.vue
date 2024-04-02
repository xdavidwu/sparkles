<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  text: string,
}>();

const html = computed(() => {
  const div = document.createElement('div');
  div.textContent = props.text;
  return div.innerHTML.replace(/((http:|https:)[^\s]+[\w])/g, (match) => {
    let url;
    try {
      url = new URL(match);
    } catch (e) {
      return match;
    }
    const a = document.createElement('a');
    a.target = '_blank';
    a.href = url.href;
    a.textContent = match;
    return a.outerHTML;
  });
});
</script>

<template>
  <div class="text-white bg-grey-darken-3 px-2 py-1 text-caption" v-html="html">
  </div>
</template>
