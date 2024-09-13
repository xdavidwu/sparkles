import type {
  V1ConfigMap, V1Secret, V1Pod, V1PersistentVolume, V1PersistentVolumeClaim,
  V1ResourceQuota, V1Service,
  V1DaemonSet, V1Deployment, V1StatefulSet,
  V2HorizontalPodAutoscaler,
  V1Job, V1CronJob,
  V1Ingress, V1NetworkPolicy,
  V1PodDisruptionBudget,
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

const HorizontalPodAutoscaler: V2HorizontalPodAutoscaler = {
  spec: {
    maxReplicas: 2,
    minReplicas: 1,
    scaleTargetRef: {
      kind: 'TODO',
      name: 'TODO',
    },
  },
};

const Job: V1Job = {
  spec: {
    template: {
      spec: {
        ...Pod.spec!,
        restartPolicy: 'OnFailure',
      },
    },
  },
};

const CronJob: V1CronJob = {
  spec: {
    schedule: 'TODO',
    jobTemplate: Job,
  },
};

const Ingress: V1Ingress = {
  spec: {
    rules: [{
      http: {
        paths: [{
          path: '/',
          pathType: 'Prefix',
          backend: {},
        }],
      },
    }],
  },
};

const NetworkPolicy: V1NetworkPolicy = {
  spec: {
    podSelector: {},
  },
};

const PodDisruptionBudget: V1PodDisruptionBudget = {
  spec: {
    selector: {},
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
  'autoscaling/v2': {
    HorizontalPodAutoscaler,
  },
  'batch/v1': {
    Job, CronJob,
  },
  'networking.k8s.io/v1': {
    Ingress, NetworkPolicy,
  },
  'policy/v1': {
    PodDisruptionBudget,
  },
};
