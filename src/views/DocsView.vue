<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { VueComponent as Content } from '@/assets/docs.md';

const div = ref<HTMLDivElement>();

onMounted(() => {
  div.value?.querySelectorAll('a[href*="//"]').forEach((a) => {
    a.setAttribute('target', '_blank');
  });
});
</script>

<template>
  <div class="markdown" ref="div">
    <Content />
  </div>
</template>
