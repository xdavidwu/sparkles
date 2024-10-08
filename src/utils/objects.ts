import type { V1ObjectMeta, V1ListMeta } from '@xdavidwu/kubernetes-client-typescript-fetch';

export interface KubernetesObject {
  apiVersion?: string;
  kind?: string;
  metadata?: V1ObjectMeta;
}

export interface KubernetesList<T = KubernetesObject> {
  apiVersion?: string;
  items: Array<T>;
  kind?: string;
  metadata?: V1ListMeta;
}

export const uniqueKeyForObject = (obj: KubernetesObject) => {
  if (obj.metadata!.uid) {
    return obj.metadata!.uid;
  }
  if (obj.metadata!.namespace) {
    return `${obj.apiVersion}/${obj.kind}/${obj.metadata!.namespace}/${obj.metadata!.name}`;
  }
  return `${obj.apiVersion}/${obj.kind}/${obj.metadata!.name}`;
};

export const isSameKubernetesObject = (a: KubernetesObject, b: KubernetesObject) =>
  uniqueKeyForObject(a) === uniqueKeyForObject(b);
