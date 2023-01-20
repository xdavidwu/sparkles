import {
  FetchError,
  V1WatchEventFromJSON,
  type ApiResponse,
  type V1ListMeta,
  type V1ObjectMeta,
} from '@/kubernetes-api/src';
import type { Ref } from 'vue';

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

export async function* rawResponseToWatchEvents<T>(raw: ApiResponse<T>,
    expectAbort = false) {
  const reader = raw.raw.body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(createLineDelimitedJSONStream())
    .getReader();

  while (true) {
    try {
      const { value, done } = await reader.read();

      if (done) {
        return;
      }

      yield V1WatchEventFromJSON(value);
    } catch (e) {
      if (expectAbort && e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
      throw e;
    }
  }
}

interface KubernetesObject {
  apiVersion?: string;
  kind?: string;
  metadata?: V1ObjectMeta;
}

interface KubernetesList {
  apiVersion?: string;
  items: Array<KubernetesObject>;
  kind?: string;
  metadata?: V1ListMeta;
}

const isSameKubernetesObject = (a: KubernetesObject, b: KubernetesObject) => {
  if (a.metadata!.uid) {
    return a.metadata!.uid === b.metadata!.uid;
  }

  if (a.metadata!.namespace && a.metadata!.namespace !== b.metadata!.namespace) {
    return false;
  }

  return a.metadata!.name === b.metadata!.name;
};

export const listAndWatch = async<ListOpt> (
    dest: Ref<Array<KubernetesObject>>,
    transformer: (obj: any) => KubernetesObject,
    lister: (opt: ListOpt) => Promise<ApiResponse<KubernetesList>>,
    opt: ListOpt,
    expectAbortOnWatch: boolean = true,
  ) => {
  const listResponse = await (await lister(opt)).value();
  dest.value = listResponse.items;

  let updates: ApiResponse<KubernetesList> | null = null;
  try {
    updates = await lister({
      ...opt,
      resourceVersion: listResponse.metadata!.resourceVersion,
      watch: true
    });
  } catch (e) {
    if (expectAbortOnWatch && e instanceof FetchError &&
        e.cause instanceof DOMException && e.cause.name === 'AbortError') {
      return;
    }
    throw e;
  }

  for await (const event of rawResponseToWatchEvents(updates!, expectAbortOnWatch)) {
    if (event.type === 'ADDED') {
      const obj = transformer(event.object);
      dest.value.push(obj);
    } else if (event.type === 'DELETED') {
      const obj = transformer(event.object);
      dest.value = dest.value.filter((v) => !isSameKubernetesObject(obj, v));
    } else if (event.type === 'MODIFIED') {
      const obj = transformer(event.object);
      const index = dest.value.findIndex((v) => isSameKubernetesObject(obj, v));
      dest.value[index] = obj;
    }
  }
};
