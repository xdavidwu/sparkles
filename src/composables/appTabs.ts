import { computed, ref, nextTick, watch } from 'vue';
import { useDisplay } from 'vuetify';

export const useAppTabs = () => {
  const render = ref(true);

  const { xs: expandAppBar } = useDisplay();

  watch(expandAppBar, async () => {
    render.value = false;
    await nextTick();
    render.value = true;
  });

  const appBarHeightPX = computed(() => expandAppBar.value ? 64 + 48 : 64);

  return {
    expandAppBar,
    render,
    appBarHeightPX,
  }
};
