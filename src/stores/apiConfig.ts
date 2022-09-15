import { defineStore } from 'pinia';
import { Configuration } from '@/kubernetes-api/src';

interface State {
  accessToken: string,
}

export const useApiConfig = defineStore('api-config', {
  state: (): State => ({
    accessToken: '',
  }),
  actions: {
    setAccessToken(token: string) {
      this.accessToken = token;
    },
    getConfig() {
      return new Configuration({basePath: import.meta.env.VITE_KUBERNETES_API, headers: {'Authorization': `Bearer ${this.accessToken}`}});
    },
  },
});
