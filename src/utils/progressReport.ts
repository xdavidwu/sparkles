import { storeToRefs } from 'pinia';
import { useProgress } from '@/stores/progress';

export const withProgress = async <T>(
  t: string, op: (setProgress: (p: string) => void) => T
): Promise<Awaited<T>> => {
  const { active, title, text } = storeToRefs(useProgress());
  active.value = true;
  title.value = t;
  try {
    return await op((p) => text.value = p);
  } finally {
    active.value = false;
  }
};
