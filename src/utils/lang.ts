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
