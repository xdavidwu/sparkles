import { storeToRefs } from 'pinia';
import { useProgress } from '@/stores/progress';

export const withProgress = async <T>(
  t: string, op: (setProgress: (p: string) => void) => T
): Promise<Awaited<T>> => {
  const { active, title, text } = storeToRefs(useProgress());
  active.value = true;
  title.value = t;
  try {
    const res = await op((p) => text.value = p);
    active.value = false;
    return res;
  } catch (e) {
    active.value = false;
    throw e;
  }
};
