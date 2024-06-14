import {
  Configuration,
  type ConfigurationParameters
} from '@/kubernetes-api/src';
import type { V2APIGroupDiscovery } from '@/utils/discoveryV2';

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

export type RequestDataInboundMessage = TokenResponse | ConfigParamsResponse | GroupsResponse;
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
}

const pendingPromises: PromiseStore = {};

const request = <K extends keyof PromiseStore>(key: K): Required<PromiseStore>[K]['promise'] => {
  if (pendingPromises[key]) {
    return pendingPromises[key]!.promise;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resolver: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promise: Promise<any> = new Promise((resolve) => {
    resolver = resolve;
  });
  pendingPromises[key] = { promise, resolver: resolver! };
  const msg: RequestDataOutboundMessage = { type: `request.${key}` };
  postMessage(msg);
  return promise;
};

export const getConfig = async () => {
  const params = await request('configParams');
  params.middleware = [];

  // TODO differentiate static/oidc
  if (params.headers?.Authorization) {
    params.middleware.push({
      pre: async (context) => {
        context.init.headers = {
          ...context.init.headers,
          Authorization: `Bearer ${await request('token')}`,
        };
        return context;
      },
    });
  }
  // TODO handle api warnings

  return new Configuration(params);
};

export const getGroups = () => request('groups');

export const handleDataResponse =
  async (e: MessageEvent): Promise<boolean> => {
    const data: RequestDataInboundMessage = e.data;
    switch (data.type) {
    case 'token':
    case 'configParams':
    case 'groups':
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