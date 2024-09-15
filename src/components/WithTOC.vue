<script setup lang="ts">
import TableOfContents from '@/components/TableOfContents.vue';
import { ref, onMounted, useTemplateRef } from 'vue';
import { useResizeObserver } from '@vueuse/core';

const div = useTemplateRef('div');
const toc = ref<Array<{ level: number, id: string, title: string }>>([]);
const tocOffset = ref(0);

const emit = defineEmits<{
  (e: 'navigate', id: string): void;
}>();

useResizeObserver(div, () => {
  tocOffset.value = div.value!.offsetWidth - div.value!.clientWidth;
});

onMounted(() => {
  toc.value = Array.from(div.value?.querySelectorAll('h1, h2, h3, h4, h5, h6') as NodeListOf<HTMLElement> ?? []).map((h) => ({
    level: Number(h.tagName.substring(1)),
    id: h.getAttribute('id')!,
    title: h.innerText,
  }));
});

const navigate = (id: string) => emit('navigate', id);
</script>

<template>
  <div class="position-relative">
    <div class="overflow-y-auto h-100" ref="div">
      <slot />
    </div>
    <TableOfContents :toc="toc" :offset="0" @navigate="navigate"/>
  </div>
</template>
