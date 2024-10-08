import type {
  RequestDataInboundMessage,
  RequestDataOutboundMessage,
} from '@/utils/requestData.webworker';
import type {
  ErrorMessage,
  ToastMessage,
  ProgressMessage,
  CompletedMessage,
} from '@/utils/fnCall.webworker';
import { PresentedError } from '@/utils/PresentedError';
import { deserializeFetchError, deserializeResponseError } from '@/utils/api';
import { useApiConfig } from '@/stores/apiConfig';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useErrorPresentation } from '@/stores/errorPresentation';

export const handleDataRequestMessages = (worker: Worker) => {
  const apiStore = useApiConfig();
  const discoveryStore = useApisDiscovery();

  return async (e: MessageEvent): Promise<boolean> => {
    const data: RequestDataOutboundMessage = e.data;
    let msg: RequestDataInboundMessage | undefined;
    switch (data.type) {
    case 'request.token':
      msg = {
        type: 'token',
        token: (await apiStore.getBearerToken())!,
      };
      worker.postMessage(msg);
      return true;
    case 'request.configParams':
      msg = {
        type: 'configParams',
        configParams: await apiStore.getCloneableConfigParams(),
      };
      worker.postMessage(msg);
      return true;
    case 'request.groups':
      msg = {
        type: 'groups',
        groups: await discoveryStore.getGroups(),
      };
      worker.postMessage(msg);
      return true;
    case 'request.versionInfo':
      msg = {
        type: 'versionInfo',
        versionInfo: await discoveryStore.getVersionInfo(),
      };
      worker.postMessage(msg);
      return true;
    case 'request.baseURL':
      msg = {
        type: 'baseURL',
        baseURL: window.__base_url,
      };
      worker.postMessage(msg);
      return true;
    default:
      return false;
    }
  };
};

export const handleErrorMessages = (reject: (e: unknown) => unknown) =>
    (e: MessageEvent): boolean => {
  const data: ErrorMessage = e.data;
  if (data.type == 'error') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let e = data.error as any;
    switch (e.type) {
    case 'PresentedError':
      e = PresentedError.deserialize(e);
      break;
    case 'FetchError':
      e = deserializeFetchError(e);
      break;
    case 'ResponseError':
      e = deserializeResponseError(e);
      break;
    }
    reject(e);
    return true;
  }
  return false;
};

export const handleToastMessages = (e: MessageEvent): boolean => {
  const data: ToastMessage = e.data;
  if (data.type == 'toast') {
    useErrorPresentation().pendingToast = data.message;
    return true;
  }
  return false;
};

export const handleProgressMessages =
  (progress: (message: string) => unknown, complete: (message?: string) => unknown) =>
    (e: MessageEvent): boolean => {
      const data: ProgressMessage | CompletedMessage = e.data;
      switch (data.type) {
      case 'progress':
        progress(data.message);
        return true;
      case 'completed':
        complete(data.message);
        return true;
      default:
        return false;
      }
    };
