import {
  V1WatchEventFromJSON,
  type ApiResponse, type V1WatchEvent,
} from '@/kubernetes-api/src';
import type { V1PartialObjectMetadata, V1Table, V1TableRow } from '@/utils/AnyApi';
import { isSameKubernetesObject, type KubernetesObject, type KubernetesList } from '@/utils/objects';
import { rawErrorIsAborted, errorIsAborted } from '@/utils/api';
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

async function* streamToGenerator<T>(r: ReadableStream<T>) {
  const reader = r.getReader();

  while (true) {
      const { value, done } = await reader.read();

      if (done) {
        return;
      }

      yield value;
  }
}

type TypedV1WatchEvent<T extends object> = V1WatchEvent & {
  object: T;
};

function rawResponseToWatchEvents<T extends KubernetesObject>(
  raw: ApiResponse<KubernetesList<T>>,
  transformer: (obj: any) => T,
): AsyncGenerator<TypedV1WatchEvent<T>>;

function rawResponseToWatchEvents(
  raw: ApiResponse<V1Table>,
): AsyncGenerator<TypedV1WatchEvent<V1Table<V1PartialObjectMetadata>>>;

// TODO support table with transformer?
function rawResponseToWatchEvents(
  raw: ApiResponse<any>,
  transformer: (obj: any) => any = (v) => v,
) {
  const stream = raw.raw.body!
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
    }));
  return streamToGenerator(stream);
}

const watch = async<T extends KubernetesObject> (
    dest: Ref<Array<T>>,
    transformer: (obj: any) => T,
    watchResponse: Promise<ApiResponse<KubernetesList<T>>>,
  ) => {
  let updates: ApiResponse<KubernetesList<T>> | null = null;
  try {
    updates = await watchResponse;
  } catch (e) {
    if (errorIsAborted(e)) {
      return;
    }
    throw e;
  }

  try {
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
  } catch (e) {
    if (rawErrorIsAborted(e)) {
      return;
    }
    throw e;
  }
};

interface WatchOpt {
  watch?: boolean;
  resourceVersion?: string;
}

export const listAndUnwaitedWatch = async<T extends KubernetesObject> (
    dest: Ref<Array<T>>,
    transformer: (obj: any) => T,
    lister: (opt: WatchOpt) => Promise<ApiResponse<KubernetesList<T>>>,
    catcher: Parameters<Promise<void>['catch']>[0],
  ) => {
  const listResponse = await (await lister({})).value();
  dest.value = listResponse.items;

  watch(
    dest,
    transformer,
    lister({ resourceVersion: listResponse.metadata!.resourceVersion, watch: true }),
  ).catch(catcher);
};

const isKubernetesObjectInRows = (
  a: V1TableRow<V1PartialObjectMetadata>,
  b: Array<V1TableRow<V1PartialObjectMetadata>>,
) => b.some((v) => isSameKubernetesObject(a.object, v.object));

export const listAndUnwaitedWatchTable = async (
    dest: Ref<V1Table<V1PartialObjectMetadata>>,
    lister: (opt: WatchOpt) => Promise<ApiResponse<V1Table<V1PartialObjectMetadata>>>,
    catcher: Parameters<Promise<void>['catch']>[0],
  ) => {
  const listResponse = await (await lister({})).value();
  if (listResponse.rows === undefined) {
    listResponse.rows = [];
  }
  dest.value = listResponse;

  (async () => {
    let updates: ApiResponse<V1Table> | null = null;
    try {
      updates = await lister({
        resourceVersion: listResponse.metadata!.resourceVersion,
        watch: true
      });
    } catch (e) {
      if (errorIsAborted(e)) {
        return;
      }
      throw e;
    }

    try {
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
    } catch (e) {
      if (rawErrorIsAborted(e)) {
        return;
      }
      throw e;
    }
  })().catch(catcher);
};
