import { ResponseError } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { PresentedError } from '@/utils/PresentedError';
import { useErrorPresentation } from '@/stores/errorPresentation';

export const notifyListingWatchErrors = (e: unknown) => {
  // keep client-error statuses, which should already be useful enough
  if (!(e instanceof ResponseError && e.response.status < 500 && e.response.status >= 400)) {
    e = new PresentedError(`Failed to watch for updates of listing:\n\n${e}\n\nReload the page to continue receiving updates.`);
  }
  useErrorPresentation().pendingError = e;
};
