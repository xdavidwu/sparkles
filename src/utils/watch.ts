import { type ApiResponse, V1WatchEventFromJSON } from '@/kubernetes-api/src';

const createLineDelimitedJSONStream = () => {
  let buffer = '';
  return new TransformStream({
    start() {},
    async transform(chunk, controller) {
      let newlineIndex = chunk.indexOf('\n');
      while (newlineIndex !== -1) {
        controller.enqueue(JSON.parse(buffer + chunk.substr(0, newlineIndex)));
        buffer = '';
        chunk = chunk.substring(newlineIndex + 1);
        newlineIndex = chunk.indexOf('\n');
      }
      buffer += chunk;
    },
    flush() {},
  });
};

export async function* rawResponseToWatchEvents<T>(raw: ApiResponse<T>) {
  const reader = raw.raw.body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(createLineDelimitedJSONStream())
    .getReader();

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      return;
    }

    yield V1WatchEventFromJSON(value);
  }
}
