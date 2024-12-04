import {
  Configuration,
  type ConfigurationParameters, type VersionInfo,
} from '@xdavidwu/kubernetes-client-typescript-fetch';
import type { V2APIGroupDiscovery } from '@/utils/discoveryV2';
import { extractWarnings, setFieldManager } from '@/utils/api';
import type { ToastMessage } from '@/utils/fnCall.webworker';

interface TokenResponse {
  type: 'token';
  token: string;
}

interface ConfigParamsResponse {
  type: 'configParams';
  configParams: ConfigurationParameters;
}

interface GroupsResponse {
  type: 'groups';
  groups: Array<V2APIGroupDiscovery>;
}

interface VersionInfoResponse {
  type: 'versionInfo';
  versionInfo: VersionInfo;
}

interface BaseURLResponse {
  type: 'baseURL';
  baseURL: string;
}

export type RequestDataInboundMessage = TokenResponse | ConfigParamsResponse | GroupsResponse | VersionInfoResponse | BaseURLResponse;
export interface RequestDataOutboundMessage {
  type: `request.${RequestDataInboundMessage['type']}`;
}

interface PromiseStoreItem<T> {
  promise: Promise<T>;
  resolver: ((v: T) => void);
}

interface PromiseStore {
  token?: PromiseStoreItem<string>;
  configParams?: PromiseStoreItem<ConfigurationParameters>;
  groups?: PromiseStoreItem<Array<V2APIGroupDiscovery>>;
  versionInfo?: PromiseStoreItem<VersionInfo>;
  baseURL?: PromiseStoreItem<string>;
}

const pendingPromises: PromiseStore = {};

const request = <K extends keyof PromiseStore>(key: K): Required<PromiseStore>[K]['promise'] => {
  if (pendingPromises[key]) {
    return pendingPromises[key]!.promise;
  }
  // TODO Promise.withResolvers() es2024
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resolver: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promise: Promise<any> = new Promise((resolve) => {
    resolver = resolve;
  });
  pendingPromises[key] = { promise, resolver };
  const msg: RequestDataOutboundMessage = { type: `request.${key}` };
  postMessage(msg);
  return promise;
};

export const getConfig = async () => {
  const params = await request('configParams');
  params.middleware = [{ pre: setFieldManager }];

  if (params.headers?.Authorization) {
    params.middleware.push({
      pre: async (context) => {
        context.init.headers = {
          ...context.init.headers,
          Authorization: `Bearer ${await request('token')}`,
        };
        return context;
      },
    }, {
      post: async ({ response }) => {
        const warnings = extractWarnings(response);
        if (!warnings.length) {
          return;
        }

        // breaks our organization a little /shrug
        const msg: ToastMessage = {
          type: 'toast',
          message: `Kubernetes returned warning at ${response.url.replace(params.basePath!, '')}:\n${warnings.join('\n')}`,
        };
        postMessage(msg);
      },
    });
  }

  return new Configuration(params);
};

export const getGroups = () => request('groups');
export const getVersionInfo = () => request('versionInfo');
export const getBaseURL = () => request('baseURL');

export const handleDataResponse =
  async (e: MessageEvent): Promise<boolean> => {
    const data: RequestDataInboundMessage = e.data;
    switch (data.type) {
    case 'token':
    case 'configParams':
    case 'groups':
    case 'versionInfo':
    case 'baseURL':
      if (pendingPromises[data.type]) {
        // @ts-expect-error data[data.type]
        pendingPromises[data.type].resolver(data[data.type]);
        if (data.type == 'token') {
          delete pendingPromises[data.type];
        }
      }
      return true;
    default:
      return false;
    }
  };
