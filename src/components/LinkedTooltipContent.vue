<script lang="ts" setup>
import LinkedDocument from '@/components/LinkedDocument.vue';

defineProps<{
  text: string,
}>();
</script>

<template>
  <LinkedDocument tag="div" paragraph :text="text"
    class="bg-teal-darken-4 px-2 py-1 rounded elevation-1 mw-40 text-caption text-denser" />
</template>

<style scoped>
.mw-40 {
  max-width: 40em;
}

.text-denser {
  line-height: 1.6;
}
</style>
