<script setup lang="ts">
import WithTOC from '@/components/WithTOC.vue';
import { useTemplateRef } from 'vue';
import { vMarkdown } from '@/directives/vMarkdown';

defineProps<{
  markdown: string;
}>();

const div = useTemplateRef('div');

const navigate = (id: string) => div.value?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView();
</script>

<template>
  <WithTOC @navigate="navigate">
    <div ref="div" class="pe-4 markdown" v-markdown="markdown" />
  </WithTOC>
</template>
