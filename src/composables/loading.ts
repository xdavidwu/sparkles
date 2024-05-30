import { ref } from 'vue';

export const useLoading = (fn: () => Promise<void>) => {
  const loading = ref(false);

  const load = async () => {
    loading.value = true;
    await fn();
    loading.value = false;
  }

  return {
    loading,
    load,
  };
};
