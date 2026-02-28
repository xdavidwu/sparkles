<script setup lang="ts">
import WithTOC from '@/components/WithTOC.vue';
import { useTemplateRef } from 'vue';
import { vMarkdown } from '@/directives/vMarkdown';
import { softNavigate } from '@/utils/markdown';

defineProps<{
  markdown: string;
}>();

const div = useTemplateRef('div');

const navigate = (id: string) => softNavigate(div.value!, id);
</script>

<template>
  <WithTOC @navigate="navigate">
    <div ref="div" class="ps-1 pe-4 markdown" v-markdown="markdown" />
  </WithTOC>
</template>
