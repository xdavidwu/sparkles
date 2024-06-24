import { defineStore, storeToRefs } from 'pinia';
import { computed, ref, onUnmounted } from 'vue';
import { useDisplay } from 'vuetify';

const store = defineStore('app-tabs', () => {
  const appTabsUsed = ref(false);
  return { appTabsUsed };
});

const commonSetup = () => {
  const { xs: expandAppBar } = useDisplay();
  const appBarHeightPX = computed(() => expandAppBar.value ? 64 + 48 : 64);

  return { expandAppBar, appBarHeightPX };
};

export const useAppTabs = () => {
  const { appTabsUsed } = storeToRefs(store());
  appTabsUsed.value = true;

  onUnmounted(() => appTabsUsed.value = false);

  return { ...commonSetup() };
};

export const renderAppTabs = () => ({ ...storeToRefs(store()), ...commonSetup() });
