<script setup lang="ts">
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import { computed } from 'vue';
import { useNow } from '@vueuse/core';
import { humanDuration } from '@/utils/duration';

const props = defineProps<{
  since: Date,
  ago?: boolean,
}>();

const now = useNow({ interval: 1000 });
const duration = computed(() =>
  humanDuration(now.value.valueOf() - props.since.valueOf()));
const tooltip = computed(() =>
  `${props.ago ? '' : 'Since: '}${props.since.toLocaleString()}`);
</script>

<template>
  <span>
    {{ duration }}
    <template v-if="ago">ago</template>
    <LinkedTooltip activator="parent" :text="tooltip" />
  </span>
</template>
