import { defineStore } from 'pinia';
import type { PresentedError } from '@/utils/PresentedError';

export const useErrorPresentation = defineStore('errors', {
  state: (): { pendingError: PresentedError | null } => ({ pendingError: null })
});
