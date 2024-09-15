<script setup lang="ts">
import TableOfContents from '@/components/TableOfContents.vue';
import { VueComponent as Content } from '@/assets/docs.md';
import { ref, onMounted } from 'vue';
import { useResizeObserver } from '@vueuse/core';

const div = ref<HTMLDivElement>();
const toc = ref<Array<{ level: number, id: string, title: string }>>([]);
const tocOffset = ref(0);

useResizeObserver(div, () => {
  tocOffset.value = div.value!.offsetWidth - div.value!.clientWidth;
});

onMounted(() => {
  div.value?.querySelectorAll('a[href*="//"]').forEach((a) => {
    a.setAttribute('target', '_blank');
  });
  toc.value = Array.from(div.value?.querySelectorAll('h1, h2, h3, h4, h5, h6') as NodeListOf<HTMLElement> ?? []).map((h) => ({
    level: Number(h.tagName.substring(1)),
    id: h.getAttribute('id')!,
    title: h.innerText,
  }));
});

const navigate = (id: string) => window.location.hash = `#${id}`;
</script>

<template>
  <div class="markdown ma-n4 position-relative" style="height: calc(100dvh - 64px)">
    <div class="overflow-y-auto pa-4 h-100" ref="div">
      <Content/>
    </div>
    <TableOfContents :toc="toc" :offset="0" @navigate="navigate"/>
  </div>
</template>
