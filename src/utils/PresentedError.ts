export class PresentedError extends Error {
  override name = 'PresentedError';
  constructor(msg: string, opt?: ErrorOptions) {
    super(msg, opt);
  }

  // TODO support cause
  serialize() {
    return {
      type: this.name,
      msg: this.message,
    };
  }

  static deserialize(i: ReturnType<PresentedError['serialize']>) {
    return new PresentedError(i.msg);
  }
}
