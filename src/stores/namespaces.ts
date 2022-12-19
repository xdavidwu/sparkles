import { defineStore } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@/kubernetes-api/src';

interface State {
  namespaces: Array<string>,
}

const apiConfig = await useApiConfig().getConfig();
const api = new CoreV1Api(apiConfig);

export const useNamespaces = defineStore('namespace', {
  state: (): State => ({ namespaces: [] }),
  actions: {
    async getNamespaces(reload = false) {
      if (this.namespaces.length === 0 || reload) {
        this.namespaces = (await api.listNamespace()).items.map((i) => (i.metadata!.name!));
      }
      return this.namespaces;
    },
  },
});
