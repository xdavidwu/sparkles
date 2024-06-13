import {
  handleFnCall,
  type FnCallInboundMessage, type FnCallOutboundMessage,
} from '@/utils/fnCall.webworker';
import {
  getConfig, handleDataResponse,
  type RequestDataInboundMessage, type RequestDataOutboundMessage,
} from '@/utils/requestData.webworker';
import { CoreApi } from '@/kubernetes-api/src';

const fns = {
  test: async (...args: Array<unknown>) => {
    const api = new CoreApi(await getConfig());
    const res = await api.getAPIVersions();
    throw new Error(`test ${JSON.stringify(res.versions)} ${JSON.stringify(args)}`);
  },
};

const handlers = [
  handleFnCall(fns),
  handleDataResponse,
];

onmessage = async (e) => {
  for (const handler of handlers) {
    if (await handler(e)) {
      return;
    }
  }
  throw new Error(`unrecognized message ${JSON.stringify(e)}`);
}

export type OutboundMessage = FnCallOutboundMessage | RequestDataOutboundMessage;
export type InboundMessage = FnCallInboundMessage<typeof fns> | RequestDataInboundMessage;
