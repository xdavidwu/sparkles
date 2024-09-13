import type {
  V1ConfigMap, V1Secret, V1Pod, V1PersistentVolume, V1PersistentVolumeClaim,
  V1ResourceQuota, V1Service,
  V1DaemonSet, V1Deployment, V1StatefulSet,
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
  metadata: {
    labels: {}, // for selectors, as V1PodTemplateSpec
  },
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

const DaemonSet: V1DaemonSet = {
  spec: {
    selector: {},
    template: Pod,
  },
};

const Deployment: V1Deployment = {
  spec: {
    replicas: 1,
    selector: {},
    template: Pod,
  },
};

const StatefulSet: V1StatefulSet = {
  spec: {
    replicas: 1,
    selector: {},
    template: Pod,
    serviceName: '',
  },
};

export const templates: { [gv: string]: { [k: string]: object } } = {
  v1: {
    ConfigMap, Secret, Pod, PersistentVolume, PersistentVolumeClaim,
    ResourceQuota, Service,
  },
  'apps/v1': {
    DaemonSet, Deployment, StatefulSet,
  },
};
