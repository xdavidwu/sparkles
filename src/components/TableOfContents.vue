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

const emit = defineEmits<{
  (e: 'navigate', id: string): void;
}>();

interface TreeItem {
  id: string;
  title: string;
  children?: Array<TreeItem>;
}

const tree = computed(() => {
  const stack: Array<Array<TreeItem>> = [[]];
  props.toc.forEach((t) => {
    let level = Number(t.level);
    const expected = stack.length;
    while (level > expected) {
      const item = { id: '', title: 'Unknown', children: [] };
      stack[stack.length - 1].push(item);
      stack.push(item.children);
      level--;
    }
    while (level < expected) {
      stack.pop();
      level++;
    }

    const item = { id: t.id, title: t.title, children: [] };
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

const navigate = (ids: unknown) => {
  const s = ids as Array<string>;
  emit('navigate', s[0]);
};
</script>

<template>
  <ExpandableSidePanel title="table of contents">
    <VTreeview class="mx overflow-y-auto light smaller"
      :items="tree" item-value="id" density="compact"
      open-all activatable mandatory
      @update:activated="navigate" />
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
  max-height: calc(100dvh - 128px);
}

.smaller {
  zoom: 0.875;
}
</style>
