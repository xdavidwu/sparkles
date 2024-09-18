import { storeToRefs } from 'pinia';
import { useProgress } from '@/stores/progress';

export const withProgress = async <T>(
  t: string, op: (setProgress: (p: string) => void) => T
): Promise<Awaited<T>> => {
  const { active, title, text } = storeToRefs(useProgress());
  active.value = true;
  title.value = t;
  text.value = title.value;
  try {
    return await op((p) => text.value = p);
  } finally {
    active.value = false;
  }
};
