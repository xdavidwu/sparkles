import { defineStore } from 'pinia';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@/kubernetes-api/src';

interface State {
  _namespaces: Array<string>,
  _updatePromise: Promise<void> | null,
  selectedNamespace: string,
}

export const useNamespaces = defineStore('namespace', {
  state: (): State => {
    return { _namespaces: [], _updatePromise: null, selectedNamespace: '' };
  },
  getters: {
    namespaces: (state) => {
      if (!state._updatePromise) {
        state._updatePromise = (async function() {
          const api = new CoreV1Api(await useApiConfig().getConfig());
          state._namespaces = (await api.listNamespace()).items.map((i) => (i.metadata!.name!));
          state.selectedNamespace = state._namespaces[0];
        })().catch((e) => useErrorPresentation().pendingError = e);
      }
      return state._namespaces;
    },
  },
});
