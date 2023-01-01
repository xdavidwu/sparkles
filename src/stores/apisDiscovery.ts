import { defineStore } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { ApisApi, CoreApi, type V1APIGroup } from '@/kubernetes-api/src';

interface State {
  _groups: Array<V1APIGroup>,
  _updatePromise: Promise<void> | null,
}

export const useApisDiscovery = defineStore('apisDiscovery', {
  state: (): State => {
    return { _groups: [], _updatePromise: null };
  },
  getters: {
    groups: (state) => {
      if (!state._updatePromise) {
        state._updatePromise = (async function() {
          const config = await useApiConfig().getConfig();
          const core = await new CoreApi(config).getAPIVersions({});
          const response = await new ApisApi(config).getAPIVersions({});
          state._groups =  [
            {
              name: '',
              versions: core.versions.map((i) => ({
                groupVersion: `core/${i}`,
                version: i,
              })),
              preferredVersion: {
                groupVersion: `core/${core.versions[core.versions.length - 1]}`,
                version: core.versions[core.versions.length - 1],
              }
            },
            ...response.groups,
          ];
        })();
      }
      return state._groups;
    },
  },
});
