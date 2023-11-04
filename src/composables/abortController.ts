import { shallowRef, computed, onUnmounted } from 'vue';

export const useAbortController = () => {
  const controller = shallowRef(new AbortController());
  const signal = computed(() => controller.value.signal);

  const abort = () => {
    controller.value.abort();
    controller.value = new AbortController();
  }

  onUnmounted(() => controller.value.abort());

  return {
    abort,
    controller,
    signal,
  };
};
