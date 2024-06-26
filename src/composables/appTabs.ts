import { defineStore, storeToRefs } from 'pinia';
import { computed, ref, onUnmounted } from 'vue';
import { useDisplay } from 'vuetify';

const store = defineStore('app-tabs', () => {
  const { xs: expandAppBar } = useDisplay();
  const appTabsUsed = ref(false);
  const appBarHeightPX = computed(() =>
    expandAppBar.value && appTabsUsed.value ? 64 + 48 : 64);
  return { appTabsUsed, expandAppBar, appBarHeightPX };
});

export const useAppTabs = () => {
  const { appTabsUsed, appBarHeightPX } = storeToRefs(store());
  appTabsUsed.value = true;

  onUnmounted(() => appTabsUsed.value = false);

  return { appBarHeightPX };
};

export const renderAppTabs = () => storeToRefs(store());
