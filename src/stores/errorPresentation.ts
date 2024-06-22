import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useErrorPresentation = defineStore('errors', () => {
  const pendingError = ref<unknown | undefined>();
  const pendingToast = ref<string | undefined>();
  return { pendingError, pendingToast };
});
