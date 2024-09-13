import type { V1ConfigMap } from '@xdavidwu/kubernetes-client-typescript-fetch';

const ConfigMap: V1ConfigMap = {
  data: {},
  binaryData: {},
};

export const templates: { [gv: string]: { [k: string]: object } } = {
  v1: {
    ConfigMap, 
  },
};
