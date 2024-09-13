import type {
  V1ConfigMap, V1Secret, V1Pod, V1PersistentVolume, V1PersistentVolumeClaim,
  V1ResourceQuota, V1Service,
} from '@xdavidwu/kubernetes-client-typescript-fetch';

const ConfigMap: V1ConfigMap = {
  data: {},
  binaryData: {},
};

const Secret: V1Secret = {
  data: {},
  stringData: {},
};

const Pod: V1Pod = {
  spec: {
    containers: [{
      name: 'name',
      image: 'TODO',
    }],
  },
};

const PersistentVolume: V1PersistentVolume = {
  spec: {
    accessModes: [],
    capacity: {
      storage: '1Gi',
    },
  },
};

const PersistentVolumeClaim: V1PersistentVolumeClaim = {
  spec: {
    accessModes: [],
    resources: {
      requests: {
        storage: '1Gi',
      },
    },
  },
};

const ResourceQuota: V1ResourceQuota = {
  spec: {
    hard: {},
  },
};

const Service: V1Service = {
  spec: {
    ports: [{
      port: 80,
    }],
  },
};

export const templates: { [gv: string]: { [k: string]: object } } = {
  v1: {
    ConfigMap, Secret, Pod, PersistentVolume, PersistentVolumeClaim,
    ResourceQuota, Service,
  },
};
