export const fetchBase64Data = (s: string) =>
  fetch(`data:application/octet-stream;base64,${s}`);

export async function* streamToGenerator<T>(r: ReadableStream<T>) {
  const reader = r.getReader();

  while (true) {
      const { value, done } = await reader.read();

      if (done) {
        return;
      }

      yield value;
  }
}
