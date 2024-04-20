import type { Middleware } from '@/kubernetes-api/src';
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

interface V1GroupVersionKind {
  group: string;
  version: string;
  kind: string;
}

export enum V2ResourceScope {
  Cluster = 'Cluster',
  Namespaced = 'Namespaced',
}

interface V2APISubresourceDiscovery {
  subresource: string;
  responseKind: V1GroupVersionKind;
  acceptedTypes?: Array<V1GroupVersionKind>;
  verbs: Array<string>;
}

interface V2APIResourceDiscovery {
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

interface V2APIVersionDiscovery {
  version: string;
  resources: Array<V2APIResourceDiscovery>;
  freshness: V2DiscoveryFreshness;
}

export interface V2APIGroupDiscovery extends KubernetesObject {
  versions: Array<V2APIVersionDiscovery>;
}

export type V2APIGroupDiscoveryList = KubernetesList<V2APIGroupDiscovery>;
