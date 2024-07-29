<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { VueComponent as Content } from '@/assets/docs.md';
import StyledMarkdown from '@/components/StyledMarkdown.vue';

const div = ref<HTMLDivElement>();

onMounted(() => {
  div.value?.querySelectorAll('a[href*="//"]').forEach((a) => {
    a.setAttribute('target', '_blank');
  });
});
</script>

<template>
  <StyledMarkdown>
    <div ref="div">
      <Content />
    </div>
  </StyledMarkdown>
</template>
