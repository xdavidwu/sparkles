<script setup lang="ts">
import HoverTooltip from '@/components/HoverTooltip.vue';
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useTime } from '@/stores/time';
import { humanDuration } from '@/utils/duration';
import { formatDateTime } from '@/utils/time';

const props = defineProps<{
  since: Date | number,
  ago?: boolean,
}>();

const { now } = storeToRefs(useTime());
const duration = computed(() =>
  humanDuration(now.value.valueOf() - props.since.valueOf()));
const tooltip = computed(() =>
  `${props.ago ? '' : 'Since: '}${formatDateTime(props.since)}`);
</script>

<template>
  <span>
    {{ duration }}
    <template v-if="ago">ago</template>
    <HoverTooltip activator="parent" :text="tooltip" />
  </span>
</template>
