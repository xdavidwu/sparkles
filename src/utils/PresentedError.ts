export class PresentedError extends Error {
  override name: 'PresentedError' = 'PresentedError';
  constructor(msg: string) {
    super(msg);
  }
}
