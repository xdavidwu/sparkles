export class PresentedError extends Error {
  override name = 'PresentedError';
  constructor(msg: string) {
    super(msg);
  }

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
