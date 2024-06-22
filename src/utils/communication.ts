import type { Ref } from 'vue';
import type {
  RequestDataInboundMessage,
  RequestDataOutboundMessage,
} from '@/utils/requestData.webworker';
import type {
  ErrorMessage,
  ProgressMessage,
  CompletedMessage,
} from '@/utils/fnCall.webworker';
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
    default:
      return false;
    }
  };
};

export const handleErrorMessages = (e: MessageEvent): boolean => {
  const data: ErrorMessage = e.data;
  if (data.type == 'error') {
    useErrorPresentation().pendingError = data.error;
    return true;
  }
  return false;
};

export const handleProgressMessages = (message: Ref<string>, completed: Ref<boolean>) =>
  (e: MessageEvent): boolean => {
    const data: ProgressMessage | CompletedMessage = e.data;
    switch (data.type) {
    case 'progress':
      message.value = data.message;
      return true;
    case 'completed':
      completed.value = true;
      return true;
    default:
      return false;
    }
  };
