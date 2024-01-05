import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { ApisApi, CoreApi, VersionApi, type V1APIGroup, type VersionInfo } from '@/kubernetes-api/src';

export const useApisDiscovery = defineStore('apisDiscovery', () => {
  const groups = ref<Array<V1APIGroup>>([]);
  const versionInfo = ref<VersionInfo | null>(null);

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

  const getVersionInfo = async () => {
    if (versionInfo.value !== null) {
      return versionInfo.value;
    }
    const config = await useApiConfig().getConfig();
    versionInfo.value = await new VersionApi(config).getCode();
    return versionInfo.value;
  };

  return { getGroups, getVersionInfo };
});
