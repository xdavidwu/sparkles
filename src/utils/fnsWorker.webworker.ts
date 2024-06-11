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

export type BaseOutboundMessage = ProgressMessage | ErrorMessage | CompletedMessage;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any) => any;
type AnyFuncsImpl = { [name: string]: AnyFunc };

interface ExtractMessage<T extends AnyFuncsImpl, K extends keyof T> {
  func: K;
  args: Parameters<T[K]>;
}

type MappedExtractMessage<T extends AnyFuncsImpl> = {
  [k in keyof T]: ExtractMessage<T, k>;
}

export type ExtractInboundMessage<T extends AnyFuncsImpl> = MappedExtractMessage<T>[keyof T];

export const registerHandler = <T extends AnyFuncsImpl>(fns: T) =>
  onmessage = async (e) => {
    const data: ExtractInboundMessage<T> = e.data;
    try {
      if (!fns[data.func]) {
        throw new Error(`unimplemented ${JSON.stringify(data)}`);
      }
      await fns[data.func](...data.args);
    } catch (e) {
      const msg: BaseOutboundMessage = {
        type: 'error',
        error: e,
      };
      postMessage(msg);
      return;
    }
    const msg: BaseOutboundMessage = {
      type: 'completed',
    };
    postMessage(msg);
  };
