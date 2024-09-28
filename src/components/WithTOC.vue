<script setup lang="ts">
import TableOfContents from '@/components/TableOfContents.vue';
import { computed, ref, onMounted, useTemplateRef } from 'vue';
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

const current = ref(0);
const currentId = computed(() => toc.value[current.value]?.id);

const detectPosition = () => {
  const position = div.value!.scrollTop;
  let i = 0;
  for (;i < toc.value.length; i += 1) {
    const el = div.value!.querySelector(`#${CSS.escape(toc.value[i].id)}`)! as HTMLElement;
    // offsetTop may change due to e.g. tabs
    if (position < el.offsetTop - 2) {
      break;
    }
  }
  current.value = i > 0 ? i - 1 : 0;
};
</script>

<template>
  <div class="position-relative">
    <div class="overflow-y-auto h-100" ref="div" @scroll="detectPosition">
      <slot />
    </div>
    <TableOfContents :toc="toc" :offset="0" :pos="currentId"
      @navigate="navigate" />
  </div>
</template>
