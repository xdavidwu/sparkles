import type { Middleware } from '@xdavidwu/kubernetes-client-typescript-fetch';
import type { KubernetesObject, KubernetesList } from '@/utils/objects';

export const discoveryV2Beta1ContentType =
  'application/json;as=APIGroupDiscoveryList;v=v2beta1;g=apidiscovery.k8s.io';
export const discoveryV2ContentType =
  'application/json;as=APIGroupDiscoveryList;v=v2;g=apidiscovery.k8s.io';

export const toV2Discovery: Middleware['pre'] = async (context) => {
  context.init.headers = {
    ...context.init.headers,
    accept: `${discoveryV2ContentType},${discoveryV2Beta1ContentType}`,
  };
  // v2 does not seems to work on /apis/ (with trailing slash) on 1.29?
  if (context.url.endsWith('/')) {
    context.url = context.url.substring(0, context.url.length - 1);
  }
  return context;
};

export interface V1GroupVersionKind {
  group: string;
  version: string;
  kind: string;
}

export enum V2ResourceScope {
  Cluster = 'Cluster',
  Namespaced = 'Namespaced',
}

export interface V2APISubresourceDiscovery {
  subresource: string;
  responseKind: V1GroupVersionKind;
  acceptedTypes?: Array<V1GroupVersionKind>;
  verbs: Array<string>;
}

export interface V2APIResourceDiscovery {
  resource: string;
  responseKind: V1GroupVersionKind;
  scope: V2ResourceScope;
  singularResource: string;
  verbs: Array<string>;
  shortNames?: Array<string>;
  categories?: Array<string>;
  subresouces?: Array<V2APISubresourceDiscovery>;
}

export enum V2DiscoveryFreshness {
  Current = 'Current',
  Stale = 'Stale',
}

export interface V2APIVersionDiscovery {
  version: string;
  resources: Array<V2APIResourceDiscovery>;
  freshness: V2DiscoveryFreshness;
}

export interface V2APIGroupDiscovery extends KubernetesObject {
  versions: Array<V2APIVersionDiscovery>;
}

export type V2APIGroupDiscoveryList = KubernetesList<V2APIGroupDiscovery>;

export const resolveGVK = (groups: Array<V2APIGroupDiscovery>,
  group: string | undefined, version: string, kind: string) =>
    groups.find((g) => g.metadata!.name === group)
      ?.versions.find((v) => v.version === version)
      ?.resources.find((r) => r.responseKind.kind === kind);

export const resolveObject =
  (groups: Array<V2APIGroupDiscovery>, r: KubernetesObject) => {
    const split = r.apiVersion!.split('/');
    const gv = split.length == 1 ? { version: r.apiVersion! } : { group: split[0], version: split[1] };
    const datum = resolveGVK(groups, gv.group, gv.version, r.kind!);
    return {
      ...gv,
      ...datum,
    };
  }
