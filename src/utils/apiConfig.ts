import type { ApiConfigInboundMessage, ApiConfigOutboundMessage } from '@/utils/apiConfig.webworker';
import { useApiConfig } from '@/stores/apiConfig';

export const handleApiConfigMessages = (worker: Worker) => {
  const store = useApiConfig();
  return async (e: MessageEvent): Promise<boolean> => {
    const data: ApiConfigOutboundMessage = e.data;
    let msg: ApiConfigInboundMessage | null = null;
    switch (data.type) {
    case 'requestToken':
      msg = {
        type: 'token',
        token: (await store.getBearerToken())!,
      };
      worker.postMessage(msg);
      return true;
    case 'requestConfigParams':
      msg = {
        type: 'configParams',
        params: await store.getCloneableConfigParams(),
      };
      worker.postMessage(msg);
      return true;
    default:
      return false;
    }
  };
};
