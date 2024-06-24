import { stringify } from 'yaml';

const _stringify = (o: unknown) => stringify(o, { indentSeq: false });

export { _stringify as stringify };
