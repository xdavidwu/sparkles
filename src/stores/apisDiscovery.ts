import { defineStore } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreApi, ApisApi, VersionApi, type VersionInfo } from '@/kubernetes-api/src';
import { toV2Discovery, type V2APIGroupDiscoveryList, type V2APIGroupDiscovery } from '@/utils/discoveryV2';

export const useApisDiscovery = defineStore('apisDiscovery', () => {
  let groups: Promise<Array<V2APIGroupDiscovery>> | null = null;
  let versionInfo: Promise<VersionInfo> | null = null;

  const getGroups = () => {
    if (!groups) {
      groups = (async () => {
        const config = await useApiConfig().getConfig();
        const listing: Array<V2APIGroupDiscovery> = [];
        (await Promise.all([new CoreApi(config), new ApisApi(config)].map(async (api) => {
          const response = (await api.withPreMiddleware(toV2Discovery).getAPIVersionsRaw({})).raw;
          const list = (await response.json()) as V2APIGroupDiscoveryList;
          if (list.kind !== 'APIGroupDiscoveryList') {
            throw new Error(`Unexpected kind on discovery: ${list.kind}, make sure server supports AggregatedDiscoveryEndpoint`);
          }
          return list.items;
        }))).forEach((items) => listing.push(...items));
        return listing;
      })();
    }
    return groups;
  };

  const getVersionInfo = async () => {
    if (!versionInfo) {
      versionInfo = (async () => {
        const config = await useApiConfig().getConfig();
        return await new VersionApi(config).getCode();
      })();
    }
    return versionInfo;
  };

  return { getGroups, getVersionInfo };
});
