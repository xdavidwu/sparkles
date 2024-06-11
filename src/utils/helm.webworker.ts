import type { InboundMessage, OutboundMessage } from '@/utils/helm.proto';

const fns = {
  test: (...args: Array<unknown>) => {
    throw new Error(`test ${JSON.stringify(args)}`);
  },
};

onmessage = (e) => {
  const data: InboundMessage = e.data;
  try {
    if (!fns[data.func]) {
      throw new Error(`unimplemented ${JSON.stringify(data)}`);
    }
    fns[data.func](...data.args);
  } catch (e) {
    const msg: OutboundMessage = {
      type: 'error',
      error: e,
    };
    postMessage(msg);
    return;
  }
  const msg: OutboundMessage = {
    type: 'completed',
  };
  postMessage(msg);
};
