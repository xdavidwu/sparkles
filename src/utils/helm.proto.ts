export interface TestCall {
  func: 'test';
  args: Array<unknown>;
}

export type InboundMessage = TestCall;

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

export type OutboundMessage = ProgressMessage | ErrorMessage | CompletedMessage;
