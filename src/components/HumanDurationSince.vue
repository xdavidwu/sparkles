<script setup lang="ts">
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useTime } from '@/stores/time';
import { humanDuration } from '@/utils/duration';

const props = defineProps<{
  since: Date,
  ago?: boolean,
}>();

const { now } = storeToRefs(useTime());
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
