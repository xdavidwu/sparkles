import { computed, ref, onUnmounted } from 'vue';
import { useDisplay } from 'vuetify';

const appTabsUsed = ref(false);

const commonSetup = () => {
  const { xs: expandAppBar } = useDisplay();
  const appBarHeightPX = computed(() => expandAppBar.value ? 64 + 48 : 64);

  return { expandAppBar, appBarHeightPX };
};

export const useAppTabs = () => {
  appTabsUsed.value = true;

  onUnmounted(() => appTabsUsed.value = false);

  return { ...commonSetup() };
};

export const renderAppTabs = () => ({ appTabsUsed, ...commonSetup() });
