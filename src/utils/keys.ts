export function uniqueKeyForObject(obj: any) {
  if (obj.metadata.uid) {
    return obj.metadata.uid;
  }
  if (obj.metadata.namespace) {
    return `${obj.apiVersion}/${obj.kind}/${obj.metadata.namespace}/${obj.metadata.name}`;
  }
  return `${obj.apiVersion}/${obj.kind}/${obj.metadata.name}`;
};
