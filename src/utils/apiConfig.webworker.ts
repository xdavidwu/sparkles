import {
  Configuration,
  type ConfigurationParameters
} from '@/kubernetes-api/src';

interface RequestTokenMessage {
  type: 'requestToken';
}

interface RequestConfigParamsMessage {
  type: 'requestConfigParams';
}

interface TokenResponse {
  type: 'token';
  token: string;
}

interface ConfigParamsResponse {
  type: 'configParams';
  params: ConfigurationParameters;
}

export type ApiConfigInboundMessage = TokenResponse | ConfigParamsResponse;
export type ApiConfigOutboundMessage = RequestTokenMessage | RequestConfigParamsMessage;

let pendingTokenPromise: Promise<string> | null = null;
let pendingTokenPromiseResolver: ((v: string) => void) | null = null;
let pendingParamsPromise: Promise<ConfigurationParameters> | null = null;
let pendingParamsPromiseResolver: ((v: ConfigurationParameters) => void) | null = null;

const requestToken = (): Promise<string> => {
  if (pendingTokenPromise) {
    return pendingTokenPromise;
  }
  pendingTokenPromise = new Promise((resolve) => {
    pendingTokenPromiseResolver = resolve;
  });
  const msg: RequestTokenMessage = { type: 'requestToken' };
  postMessage(msg);
  return pendingTokenPromise;
};

const requestConfigParams = (): Promise<ConfigurationParameters> => {
  if (pendingParamsPromise) {
    return pendingParamsPromise;
  }
  pendingParamsPromise = new Promise((resolve) => {
    pendingParamsPromiseResolver = resolve;
  });
  const msg: RequestConfigParamsMessage = { type: 'requestConfigParams' };
  postMessage(msg);
  return pendingParamsPromise;
};

export const getConfig = async () => {
  const params = await requestConfigParams();

  // TODO differentiate static/oidc
  if (params.headers?.Authorization) {
    params.middleware = [{
      pre: async (context) => {
        context.init.headers = {
          ...context.init.headers,
          Authorization: `Bearer ${await requestToken()}`,
        };
        return context;
      },
    }];
  }
  // TODO handle api warnings

  return new Configuration(params);
};

export const handleApiConfigResponse =
  async (e: MessageEvent): Promise<boolean> => {
    const data: ApiConfigInboundMessage = e.data;
    switch (data.type) {
    case 'token':
      if (pendingTokenPromiseResolver) {
        pendingTokenPromiseResolver(data.token);
        pendingTokenPromise = null;
      }
      return true;
    case 'configParams':
      if (pendingParamsPromiseResolver) {
        pendingParamsPromiseResolver(data.params);
        pendingTokenPromise = null;
      }
      return true;
    default:
      return false;
    }
  };
