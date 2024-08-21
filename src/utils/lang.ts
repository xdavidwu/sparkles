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
      if (!rawErrorIsAborted) {
        throw e;
      }
    });
  }
}
