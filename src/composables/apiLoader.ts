import { useLoading } from '@/composables/loading';
import { useAbortController } from '@/composables/abortController';
import { errorIsAborted } from '@/utils/api';
import { ignore } from '@/utils/lang';

export const useApiLoader = (fn: (signal: AbortSignal) => Promise<unknown>) => {
  const { abort, signal } = useAbortController();

  return useLoading(async () => {
    abort();
    await ignore(fn(signal.value), errorIsAborted);
  })
};
