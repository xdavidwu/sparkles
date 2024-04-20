import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreApi, ApisApi, VersionApi, type VersionInfo } from '@/kubernetes-api/src';
import { toV2Discovery, type V2APIGroupDiscoveryList, type V2APIGroupDiscovery } from '@/utils/discoveryV2';

export const useApisDiscovery = defineStore('apisDiscovery', () => {
  const groups = ref<Array<V2APIGroupDiscovery>>([]);
  const versionInfo = ref<VersionInfo | null>(null);

  const getGroups = async () => {
    if (groups.value.length !== 0) {
      return groups.value;
    }
    const config = await useApiConfig().getConfig();
    await Promise.all([new CoreApi(config), new ApisApi(config)].map(async (api) => {
      const response = (await api.withPreMiddleware(toV2Discovery).getAPIVersionsRaw({})).raw;
      const list = (await response.json()) as V2APIGroupDiscoveryList;
      if (list.kind !== 'APIGroupDiscoveryList') {
        throw new Error(`Unexpected kind on discovery: ${list.kind}, make sure server supports AggregatedDiscoveryEndpoint`);
      }
      groups.value.push(...list.items);
    }));
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
