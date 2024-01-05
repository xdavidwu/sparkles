import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { ApisApi, CoreApi, type V1APIGroup } from '@/kubernetes-api/src';

export const useApisDiscovery = defineStore('apisDiscovery', () => {
  const groups = ref<Array<V1APIGroup>>([]);

  const getGroups = async () => {
    if (groups.value.length !== 0) {
      return groups.value;
    }
    const config = await useApiConfig().getConfig();
    const core = await new CoreApi(config).getAPIVersions({});
    const response = await new ApisApi(config).getAPIVersions({});
    groups.value = [
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
    return groups.value;
  };

  return { getGroups };
});
