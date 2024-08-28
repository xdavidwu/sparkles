import { useLoading } from '@/composables/loading';
import { useAbortController } from '@/composables/abortController';
import { errorIsAborted } from '@/utils/api';

export const useApiLoader = (fn: (signal: AbortSignal) => Promise<unknown>) => {
  const { abort, signal } = useAbortController();

  return useLoading(async () => {
    abort();
    try {
      await fn(signal.value);
    } catch (e) {
      if (!await errorIsAborted(e)) {
        throw e;
      }
    }
  })
};
