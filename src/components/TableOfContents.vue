<script setup lang="ts">
import { computed } from 'vue';
import { VTreeview } from 'vuetify/labs/components';
import ExpandableSidePanel from '@/components/ExpandableSidePanel.vue';

const props = defineProps<{
  toc: Array<{
    level: number;
    id: string;
    title: string;
  }>;
}>();

interface TreeItem {
  id: symbol;
  title: string;
  children?: Array<TreeItem>;
}

const tree = computed(() => {
  const stack: Array<Array<TreeItem>> = [[]];
  props.toc.forEach((t) => {
    let level = Number(t.level);
    const expected = stack.length;
    while (level > expected) {
      const item = { id: Symbol(''), title: 'Unknown', children: [] };
      stack[stack.length - 1].push(item);
      console.log(stack.length);
      stack.push(item.children);
      console.log(stack.length);
      level--;
    }
    while (level < expected) {
      stack.pop();
      level++;
    }

    const item = { id: Symbol(t.id), title: t.title, children: [] };
    stack[stack.length - 1].push(item);
    stack.push(item.children);
  });
  const trim = (item: TreeItem) => {
    if (item.children?.length) {
      item.children.forEach(trim);
    } else {
      delete item.children;
    }
  };
  stack[0].forEach(trim);
  return stack[0];
});
</script>

<template>
  <ExpandableSidePanel title="table of contents">
    <div class="mx overflow-y-auto">
      <VTreeview class="light" :items="tree" density="compact" />
    </div>
  </ExpandableSidePanel>
</template>

<style scoped>
:deep(.v-list-item--density-compact.v-list-item--one-line) {
  min-height: 36px;
}

.light {
  background-color: rgb(var(--v-theme-surface-light));
}

.mx {
  max-height: calc(100dvh - 256px);
}
</style>
