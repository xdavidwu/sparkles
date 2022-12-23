import { defineStore } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@/kubernetes-api/src';

interface State {
  namespaces: Array<string>,
  selectedNamespace: string | null,
  api: CoreV1Api | null,
}

export const useNamespaces = defineStore('namespace', {
  state: (): State => {
    return { namespaces: [], selectedNamespace: null, api: null };
  },
  actions: {
    async getNamespaces(reload = false) {
      if (this.namespaces.length === 0 || reload) {
        if (!this.api) {
          const apiConfig = await useApiConfig().getConfig();
          this.api = new CoreV1Api(apiConfig);
        }
        this.namespaces = (await this.api.listNamespace()).items.map((i) => (i.metadata!.name!));
        this.selectedNamespace = this.namespaces[0];
      }
      return this.namespaces;
    },
  },
});
