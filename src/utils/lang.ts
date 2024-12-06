import { rawErrorIsAborted } from '@/utils/api';

export const fetchBase64Data = (s: string) =>
  fetch(`data:application/octet-stream;base64,${s}`);

// https://caniuse.com/mdn-api_readablestream_--asynciterator
export async function* streamToGenerator<T>(r: ReadableStream<T>) {
  const reader = r.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        return;
      }

      yield value;
    }
  } finally {
    reader.cancel().catch((e) => {
      if (!rawErrorIsAborted(e)) {
        throw e;
      }
    });
  }
}

export const createLineDelimitedStream = () => {
  let buffer = '';
  return new TransformStream({
    start: () => {},
    transform: async (chunk, controller) => {
      let newlineIndex = chunk.indexOf('\n');
      while (newlineIndex !== -1) {
        controller.enqueue(buffer + chunk.substr(0, newlineIndex));
        buffer = '';
        chunk = chunk.substring(newlineIndex + 1);
        newlineIndex = chunk.indexOf('\n');
      }
      buffer += chunk;
    },
    flush: () => {},
  });
};

export const ignore = async <T>(
  op: T, condition: (e: unknown) => Promise<boolean> | boolean,
): Promise<Awaited<T> | undefined> => {
  try {
    return await op;
  } catch (e) {
    if (!await condition(e)) {
      throw e;
    }
  }
};

export const timeout = (t: number) =>
  new Promise((resolve) => setTimeout(resolve, t));

// https://tc39.es/ecma402/#sec-createdatetimeformat
const intlDateDefaults: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
};
const intlTimeDefaults: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
};

// a la Date.prototype.toLocaleDateString()
export const dateFormatter = new Intl.DateTimeFormat(undefined, intlDateDefaults);
// a la Date.prototype.toLocaleString()
export const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  ...intlDateDefaults,
  ...intlTimeDefaults,
});

// invalid date (NaN) throws unlike toLocale*String
export const formatDate = dateFormatter.format;
export const formatDateTime = dateTimeFormatter.format;

// objects
export type OnlyRequired<T> = { [K in keyof T as (undefined extends T[K] ? never : K)]: T[K] };
export type MakePartial<T, C extends keyof T> = Omit<T, C> & Partial<Pick<T, C>>;

// tuples
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Last<T extends Array<any>>  = T extends [ ...any, infer L ] ? L : never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExceptLast<T extends Array<any>>  = T extends [ ...infer R, any ] ? R : never;

// funcs
export type ParametersExceptFirst<T> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (f: any, ...r: infer R) => any ? R : never;
