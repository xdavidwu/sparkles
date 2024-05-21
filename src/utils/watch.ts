import {
  FetchError,
  V1WatchEventFromJSON,
  type ApiResponse,
} from '@/kubernetes-api/src';
import type { V1PartialObjectMetadata, V1Table, V1TableRow } from '@/utils/AnyApi';
import { isSameKubernetesObject, type KubernetesObject, type KubernetesList } from '@/utils/objects';
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

export async function* rawResponseToWatchEvents<T>(raw: ApiResponse<T>) {
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
      if (e instanceof DOMException && e.name === 'AbortError') {
        return;
      }
      throw e;
    }
  }
}

export const watch = async (
    dest: Ref<Array<KubernetesObject>>,
    transformer: (obj: any) => KubernetesObject,
    watcher: () => Promise<ApiResponse<KubernetesList>>,
  ) => {
  let updates: ApiResponse<KubernetesList> | null = null;
  try {
    updates = await watcher();
  } catch (e) {
    if (e instanceof FetchError &&
        e.cause instanceof DOMException && e.cause.name === 'AbortError') {
      return;
    }
    throw e;
  }

  for await (const event of rawResponseToWatchEvents(updates!)) {
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

export const listAndUnwaitedWatch = async<ListOpt> (
    dest: Ref<Array<KubernetesObject>>,
    transformer: (obj: any) => KubernetesObject,
    lister: (opt: ListOpt) => Promise<ApiResponse<KubernetesList>>,
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
      const obj = <V1Table<V1PartialObjectMetadata>> event.object;
      if (event.type === 'ADDED') {
        dest.value.rows!.push(...obj.rows!);
      } else if (event.type === 'DELETED') {
        dest.value.rows = dest.value.rows!.filter((v) => !isKubernetesObjectInRows(v, obj.rows!));
      } else if (event.type === 'MODIFIED') {
        for (const r of obj.rows!) {
          const index = dest.value.rows!.findIndex(
            (v) => isSameKubernetesObject(v.object, r.object)
          );
          dest.value.rows![index] = r;
        }
      }
    }
  })().catch(catcher);
};
