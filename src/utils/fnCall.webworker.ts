export interface ErrorMessage {
  type: 'error';
  error: unknown;
}

export interface CompletedMessage {
  type: 'completed';
}

export interface ProgressMessage {
  type: 'progress';
  message: string;
}

export type FnCallOutboundMessage = ProgressMessage | ErrorMessage | CompletedMessage;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any) => any;
type AnyFuncsImpl = { [name: string]: AnyFunc };

interface ExtractMessage<T extends AnyFuncsImpl, K extends keyof T> {
  type: 'call';
  func: K;
  args: Parameters<T[K]>;
}

type MappedExtractMessage<T extends AnyFuncsImpl> = {
  [k in keyof T]: ExtractMessage<T, k>;
}

export type FnCallInboundMessage<T extends AnyFuncsImpl> = MappedExtractMessage<T>[keyof T];

export const progress = (message: string) => {
  const msg: ProgressMessage = {
    type: 'progress',
    message,
  };
  postMessage(msg);
};

export const handleFnCall = <T extends AnyFuncsImpl>(fns: T) =>
  async (e: MessageEvent): Promise<boolean> => {
    const data: FnCallInboundMessage<T> = e.data;
    if (data.type != 'call') {
      return false;
    }
    try {
      if (!fns[data.func]) {
        throw new Error(`unimplemented ${JSON.stringify(data)}`);
      }
      await fns[data.func](...data.args);
    } catch (_e) {
      let e = _e;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ea = e as any;
      if (typeof ea.serialize == 'function') {
        e = ea.serialize();
      }
      const msg: FnCallOutboundMessage = {
        type: 'error',
        error: e,
      };
      postMessage(msg);
      return true;
    }
    const msg: FnCallOutboundMessage = {
      type: 'completed',
    };
    postMessage(msg);
    return true;
  };
