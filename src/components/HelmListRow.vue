<script setup lang="ts">
import { VBadge, VBtn, VDataTableRow } from 'vuetify/components';
import HoverTooltip from '@/components/HoverTooltip.vue';
import TippedBtn from '@/components/TippedBtn.vue';
import { computed } from 'vue';
import { type Release, type ChartVersion, Status } from '@/utils/helm';
import { gt } from 'semver';

const props = defineProps<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any,
  latestChart?: ChartVersion,
  expandable?: boolean,
  expanded?: boolean,
  history?: boolean,
}>();

const emit = defineEmits<{
  (e: 'view'): void;
  (e: 'uninstall'): void;
  (e: 'upgrade', intent: 'values' | 'upgrade'): void;
  (e: 'rollback'): void;
  (e: 'purge'): void;
  (e: 'toggleExpand'): void;
}>();

const release = computed<Release>(() => props.item.raw);
const upgrade = computed(() =>
  (props.latestChart && gt(props.latestChart.version, release.value.chart.metadata.version)) ?
    props.latestChart : undefined);
</script>

<template>
  <VDataTableRow :item="item" :class="{ 'group-header': !history, 'darken': history }">
    <template #[`item.data-table-group`]="{ value }">
      <template v-if="!history">
        <TippedBtn size="small" variant="text" :icon="expanded ? '$expand' : '$next'"
          :disabled="!expandable" :tooltip="expanded ? 'Hide history' : 'Show history'"
          @click="emit('toggleExpand')" />
        {{ value }}
      </template>
      <VBtn v-else size="small" variant="text" disabled icon="mdi-circle-small" />
    </template>
    <template #[`item.version`]="{ value }">
      <span class="pe-2">
        {{ value }}
        <HoverTooltip activator="parent"
          :text="`Last deployed: ${(new Date(release.info.last_deployed!)).toLocaleString()}`" />
      </span>
    </template>
    <template #[`item.chart.metadata.name`]="{ value }">
      <div class="d-flex align-center">
        <img class="chart-icon mr-2" :src="release.chart.metadata.icon" />
        {{ value }}
        <HoverTooltip v-if="release.chart.metadata.description"
          activator="parent" :text="release.chart.metadata.description" />
      </div>
    </template>
    <template #[`item.chart.metadata.version`]="{ value }">
      <VBadge v-if="upgrade && upgrade.version != release.chart.metadata.version"
        color="red" dot>
        {{ value }}&nbsp;&nbsp;
        <HoverTooltip activator="parent" :text="`${upgrade!.version} is available`" />
      </VBadge>
      <template v-else>{{ value }}</template>
    </template>
    <template #[`item.chart.metadata.appVersion`]="{ value }">
      <VBadge v-if="upgrade && upgrade.appVersion != release.chart.metadata.appVersion"
        color="red" dot>
        {{ value }}&nbsp;&nbsp;
        <HoverTooltip activator="parent" :text="`${upgrade.appVersion} is available`" />
      </VBadge>
      <template v-else>{{ value }}</template>
    </template>
    <template #[`item.actions`]>
      <TippedBtn size="small" icon="$info" tooltip="More information" variant="text"
        @click="emit('view')" />
      <template v-if="!history">
        <template v-if="release.info.status == Status.DEPLOYED">
          <TippedBtn v-if="upgrade" size="small" icon="mdi-update" variant="text"
            :tooltip="`Upgrade to chart version ${upgrade.version}, app version ${upgrade.appVersion}`"
            @click="emit('upgrade', 'upgrade')" />
          <TippedBtn v-else-if="latestChart && latestChart.version == release.chart.metadata.version"
            size="small" icon="$edit" variant="text" tooltip="Edit values"
            @click="emit('upgrade', 'values')" />
          <TippedBtn size="small" icon="mdi-delete" tooltip="Uninstall" variant="text"
            @click="emit('uninstall')" />
        </template>
        <template v-if="release.info.status == Status.UNINSTALLED">
          <TippedBtn size="small" icon="mdi-reload" tooltip="Restore" variant="text"
            @click="emit('rollback')" />
          <TippedBtn size="small" icon="$close" tooltip="Remove history" variant="text"
            @click="emit('purge')" />
        </template>
      </template>
      <TippedBtn v-else-if="release.info.status == Status.SUPERSEDED"
        size="small" icon="mdi-reload" tooltip="Rollback" variant="text"
        @click="emit('rollback')" />
    </template>
  </VDataTableRow>
</template>

<style scoped>
.chart-icon {
  max-height: 2em;
  max-width: 2em;
}

.darken {
  background-color: rgba(var(--v-theme-background), var(--v-medium-emphasis-opacity));
}

/* newest in history, same as group header */
.group-header + .darken {
  display: none;
}
</style>
