export class PresentedError extends Error {
  override name = 'PresentedError';
  constructor(msg: string) {
    super(msg);
  }
}
