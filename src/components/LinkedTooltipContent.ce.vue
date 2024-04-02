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

<style>
/* forward-declaration of sort for shadow dom */

.bg-grey-darken-3 {
  background-color: #424242 !important;
  color: #FFFFFF !important;
}

.text-caption {
  font-size: 0.75rem !important;
  font-weight: 400;
  line-height: 1.25rem;
  letter-spacing: 0.0333333333em !important;
  font-family: "Roboto", sans-serif;
  text-transform: none !important;
}

.text-white {
  color: #FFFFFF !important;
}

.px-2 {
  padding-right: 8px !important;
  padding-left: 8px !important;
}

.py-1 {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

a[target="_blank"] {
  color: #9e9eff;
}

a[target="_blank"]:visited {
  color: #d0adf0;
}

a[target="_blank"]:active, a[target="_blank"]:visited:active {
  color: #ff9e9e;
}
</style>
