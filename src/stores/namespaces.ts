import { defineStore } from 'pinia';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api, V1NamespaceFromJSON } from '@/kubernetes-api/src';
import { rawResponseToWatchEvents } from '@/utils/watch';

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
          const response = await api.listNamespace();
          state._namespaces = response.items.map((i) => (i.metadata!.name!));
          state.selectedNamespace = state._namespaces[0];

          const updates = await api.listNamespaceRaw({
            resourceVersion: response.metadata!.resourceVersion,
            watch: true
          });

          for await (const event of rawResponseToWatchEvents(updates)) {
            if (event.type === 'ADDED') {
              const namespace = V1NamespaceFromJSON(event.object);
              state._namespaces.push(namespace.metadata!.name!);
            } else if (event.type === 'DELETED') {
              const namespace = V1NamespaceFromJSON(event.object);
              const name = namespace.metadata!.name!;

              state._namespaces = state._namespaces.filter((v) => v !== name);
              if (state.selectedNamespace === name) {
                // TODO: pop a notification?
                state.selectedNamespace = state._namespaces[0];
              }
            }
          }
        })().catch((e) => useErrorPresentation().pendingError = e);
      }
      return state._namespaces;
    },
  },
});
