import type {
  RequestDataInboundMessage,
  RequestDataOutboundMessage,
} from '@/utils/requestData.webworker';
import { useApiConfig } from '@/stores/apiConfig';
import { useApisDiscovery } from '@/stores/apisDiscovery';

export const handleDataRequestMessages = (worker: Worker) => {
  const apiStore = useApiConfig();
  const discoveryStore = useApisDiscovery();

  return async (e: MessageEvent): Promise<boolean> => {
    const data: RequestDataOutboundMessage = e.data;
    let msg: RequestDataInboundMessage | null = null;
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
    default:
      return false;
    }
  };
};
