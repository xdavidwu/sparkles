import { defineStore } from 'pinia';

export const useErrorPresentation = defineStore('errors', {
  state: (): { pendingError: any | null } => ({ pendingError: null })
});
