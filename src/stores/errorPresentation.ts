import { defineStore } from 'pinia';

export const useErrorPresentation = defineStore('errors', {
  state: (): { pendingError: unknown | null, pendingToast: string | null } =>
    ({ pendingError: null, pendingToast: null }),
});
