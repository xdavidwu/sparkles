import {
  type FnCallInboundMessage,
  type FnCallOutboundMessage,
  handleFnCall,
} from '@/utils/fnCall.webworker';

const fns = {
  test: async (...args: Array<unknown>) => {
    throw new Error(`test ${JSON.stringify(args)}`);
  },
};

const handlers = [
  handleFnCall(fns),
];

onmessage = async (e) => {
  for (const handler of handlers) {
    if (await handler(e)) {
      return;
    }
  }
  throw new Error(`unrecognized message ${JSON.stringify(e)}`);
}

export type OutboundMessage = FnCallOutboundMessage;
export type InboundMessage = FnCallInboundMessage<typeof fns>;
