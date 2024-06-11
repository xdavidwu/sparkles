import {
  type ExtractInboundMessage,
  registerHandler,
} from '@/utils/fnsWorker.webworker';

const fns = {
  test: (...args: Array<unknown>) => {
    throw new Error(`test ${JSON.stringify(args)}`);
  },
};

registerHandler(fns);

export type { BaseOutboundMessage as OutboundMessage } from '@/utils/fnsWorker.webworker';
export type InboundMessage = ExtractInboundMessage<typeof fns>;
