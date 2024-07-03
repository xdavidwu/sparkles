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

  static deserialize(i: unknown): PresentedError {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iany = i as any;
    return new PresentedError(iany.msg);
  }
}
