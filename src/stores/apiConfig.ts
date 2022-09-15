import { defineStore } from 'pinia';
import { Configuration } from '@/kubernetes-api/src';
import { useLocalStorage } from '@vueuse/core';
import type { RemovableRef } from '@vueuse/shared';

interface State {
  accessToken: RemovableRef<string>,
}

export const useApiConfig = defineStore('api-config', {
  state: (): State => ({
    accessToken: useLocalStorage('access-token', ''),
  }),
  actions: {
    setAccessToken(token: string) {
      this.accessToken = token;
    },
    getAccessToken() {
      return this.accessToken;
    },
    getConfig() {
      return new Configuration({basePath: import.meta.env.VITE_KUBERNETES_API, headers: {'Authorization': `Bearer ${this.accessToken}`}});
    },
  },
});
