import { parse, stringify } from 'yaml';
import { PresentedError } from '@/utils/PresentedError';

const _stringify = (o: unknown) => stringify(o, { indentSeq: false });

export { _stringify as stringify };

export const parseInput = (s: string) => {
  try {
    return parse(s);
  } catch (e) {
    throw new PresentedError(`Invalid YAML input:\n${e}`, { cause: e });
  }
};
