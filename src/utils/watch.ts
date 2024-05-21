import {
  FetchError, V1WatchEventFromJSON,
  type ApiResponse, type V1WatchEvent,
} from '@/kubernetes-api/src';
import type { V1PartialObjectMetadata, V1Table, V1TableRow } from '@/utils/AnyApi';
import { isSameKubernetesObject, type KubernetesObject, type KubernetesList } from '@/utils/objects';
import type { Ref } from 'vue';

const createLineDelimitedJSONStream = () => {
  let buffer = '';
  return new TransformStream({
    start: () => {},
    transform: async (chunk, controller) => {
      let newlineIndex = chunk.indexOf('\n');
      while (newlineIndex !== -1) {
        controller.enqueue(JSON.parse(buffer + chunk.substr(0, newlineIndex)));
        buffer = '';
        chunk = chunk.substring(newlineIndex + 1);
        newlineIndex = chunk.indexOf('\n');
      }
      buffer += chunk;
    },
    flush: () => {},
  });
};

type TypedV1WatchEvent<T extends object> = V1WatchEvent & {
  object: T,
};

function rawResponseToWatchEvents<T extends KubernetesObject>(
  raw: ApiResponse<KubernetesList<T>>,
  transformer: (obj: any) => T,
): AsyncGenerator<TypedV1WatchEvent<T>>;

  function rawResponseToWatchEvents(
  raw: ApiResponse<V1Table>,
): AsyncGenerator<TypedV1WatchEvent<V1Table<V1PartialObjectMetadata>>>;

// TODO support table with transformer?
async function* rawResponseToWatchEvents(
    raw: ApiResponse<any>,
    transformer: (obj: any) => any = (v) => v,
) {
  const reader = raw.raw.body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(createLineDelimitedJSONStream())
    .pipeThrough(new TransformStream({
      start: () => {},
      transform: async (chunk, controller) => {
        const ev = V1WatchEventFromJSON(chunk);
        if (ev.object) {
          ev.object = transformer(ev.object);
        }
        controller.enqueue(ev);
      },
      flush: () => {},
    }))
    .getReader();

  while (true) {
    try {
      const { value, done } = await reader.read();

      if (done) {
        return;
      }

      yield value;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
      throw e;
    }
  }
}

export const watch = async<T extends KubernetesObject> (
    dest: Ref<Array<T>>,
    transformer: (obj: any) => T,
    watcher: () => Promise<ApiResponse<KubernetesList<T>>>,
  ) => {
  let updates: ApiResponse<KubernetesList<T>> | null = null;
  try {
    updates = await watcher();
  } catch (e) {
    if (e instanceof FetchError &&
        e.cause instanceof DOMException && e.cause.name === 'AbortError') {
      return;
    }
    throw e;
  }

  for await (const event of rawResponseToWatchEvents(updates!, transformer)) {
    if (event.type === 'ADDED') {
      dest.value.push(event.object);
    } else if (event.type === 'DELETED') {
      dest.value = dest.value.filter((v) => !isSameKubernetesObject(event.object, v));
    } else if (event.type === 'MODIFIED') {
      const index = dest.value.findIndex((v) => isSameKubernetesObject(event.object, v));
      dest.value[index] = event.object;
    }
  }
};

export const listAndUnwaitedWatch = async<T extends KubernetesObject, ListOpt> (
    dest: Ref<Array<T>>,
    transformer: (obj: any) => T,
    lister: (opt: ListOpt) => Promise<ApiResponse<KubernetesList<T>>>,
    opt: ListOpt,
    catcher: Parameters<Promise<void>['catch']>[0],
  ) => {
  const listResponse = await (await lister(opt)).value();
  dest.value = listResponse.items;

  watch(
    dest,
    transformer,
    () => lister({ ...opt, resourceVersion: listResponse.metadata!.resourceVersion, watch: true }),
  ).catch(catcher);
};

const isKubernetesObjectInRows = (
  a: V1TableRow<V1PartialObjectMetadata>,
  b: Array<V1TableRow<V1PartialObjectMetadata>>,
) => b.some((v) => isSameKubernetesObject(a.object, v.object));

export const listAndUnwaitedWatchTable = async<ListOpt> (
    dest: Ref<V1Table<V1PartialObjectMetadata>>,
    lister: (opt: ListOpt) => Promise<ApiResponse<V1Table<V1PartialObjectMetadata>>>,
    opt: ListOpt,
    catcher: Parameters<Promise<void>['catch']>[0],
  ) => {
  const listResponse = await (await lister(opt)).value();
  if (listResponse.rows === undefined) {
    listResponse.rows = [];
  }
  dest.value = listResponse;

  (async () => {
    let updates: ApiResponse<V1Table> | null = null;
    try {
      updates = await lister({
        ...opt,
        resourceVersion: listResponse.metadata!.resourceVersion,
        watch: true
      });
    } catch (e) {
      if (e instanceof FetchError &&
          e.cause instanceof DOMException && e.cause.name === 'AbortError') {
        return;
      }
      throw e;
    }

    for await (const event of rawResponseToWatchEvents(updates!)) {
      if (event.type === 'ADDED') {
        dest.value.rows!.push(...event.object.rows!);
      } else if (event.type === 'DELETED') {
        dest.value.rows = dest.value.rows!.filter((v) => !isKubernetesObjectInRows(v, event.object.rows!));
      } else if (event.type === 'MODIFIED') {
        for (const r of event.object.rows!) {
          const index = dest.value.rows!.findIndex(
            (v) => isSameKubernetesObject(v.object, r.object)
          );
          dest.value.rows![index] = r;
        }
      }
    }
  })().catch(catcher);
};
