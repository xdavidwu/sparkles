import {
  V1WatchEventFromJSON,
  type ApiResponse, type V1WatchEvent,
} from '@xdavidwu/kubernetes-client-typescript-fetch';
import type { V1PartialObjectMetadata, V1Table } from '@/utils/AnyApi';
import { isSameKubernetesObject, type KubernetesObject, type KubernetesList } from '@/utils/objects';
import { rawErrorIsAborted, errorIsAborted, V1WatchEventType } from '@/utils/api';
import { streamToGenerator } from '@/utils/lang';
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
  type: V1WatchEventType;
  object: T;
};

type ListTypeOf<T> = KubernetesList<T> | T; // FIXME with conditional types?

const rawResponseToWatchEvents = <T extends object>(
  raw: ApiResponse<ListTypeOf<T>>,
  transformer: (obj: object) => T,
): AsyncGenerator<TypedV1WatchEvent<T>> => {
  const stream = raw.raw.body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(createLineDelimitedJSONStream())
    .pipeThrough(new TransformStream({
      start: () => {},
      transform: async (chunk, controller) => {
        const ev = V1WatchEventFromJSON(chunk);
        controller.enqueue(ev.type === V1WatchEventType.BOOKMARK ? ev : { ...ev, object: transformer(ev.object) });
      },
      flush: () => {},
    }));
  return streamToGenerator(stream);
};

const watch = async<T extends { metadata?: { resourceVersion?: string } }> (
  watchResponse: Promise<ApiResponse<ListTypeOf<T>>>,
  transformer: (obj: object) => T,
  handler: (event: TypedV1WatchEvent<T>) => boolean | void,
  resourceVersion: string,
  expectAbort: boolean,
): Promise<string | void> => {
  let updates;
  try {
    updates = await watchResponse;
  } catch (e) {
    if (expectAbort && errorIsAborted(e)) {
      return;
    }
    throw e;
  }

  let lastResourceVersion = resourceVersion;
  try {
    for await (const event of rawResponseToWatchEvents(updates, transformer)) {
      lastResourceVersion = event.object.metadata!.resourceVersion!;
      if (event.type !== V1WatchEventType.BOOKMARK && handler(event)) {
        return;
      }
    }
  } catch (e) {
    if (expectAbort && rawErrorIsAborted(e)) {
      return;
    }
    console.log("error on watch:", e);
  }
  return lastResourceVersion;
};

const watchArrayHandler = <T extends KubernetesObject>(dest: Ref<Array<T>>):
    (e: TypedV1WatchEvent<T>) => boolean | void =>
  (event) => {
    if (event.type === V1WatchEventType.ADDED) {
      dest.value.push(event.object);
    } else if (event.type === V1WatchEventType.DELETED) {
      dest.value = dest.value.filter((v) => !isSameKubernetesObject(event.object, v));
    } else if (event.type === V1WatchEventType.MODIFIED) {
      const index = dest.value.findIndex((v) => isSameKubernetesObject(event.object, v));
      dest.value[index] = event.object;
    }
  };

const tableTransformer = (o: object) => o as V1Table<V1PartialObjectMetadata>;
const watchTableHandler = (dest: Ref<V1Table<V1PartialObjectMetadata>>):
    (e: TypedV1WatchEvent<V1Table<V1PartialObjectMetadata>>) => boolean | void =>
  (event) => {
    if (event.type === V1WatchEventType.ADDED) {
      dest.value.rows!.push(...event.object.rows!);
    } else if (event.type === V1WatchEventType.DELETED) {
      dest.value.rows = dest.value.rows!.filter((v) =>
        !event.object.rows!.some((r) => isSameKubernetesObject(v.object, r.object)));
    } else if (event.type === V1WatchEventType.MODIFIED) {
      for (const r of event.object.rows!) {
        const index = dest.value.rows!.findIndex(
          (v) => isSameKubernetesObject(v.object, r.object)
        );
        dest.value.rows![index] = r;
      }
    }
  };

interface WatchOpt {
  watch?: boolean;
  resourceVersion?: string;
  allowWatchBookmarks?: boolean;
}

const retryingWatch = async<T extends { metadata?: { resourceVersion?: string } }> (
  resourceVersion: string,
  lister: (opt: WatchOpt) => Promise<ApiResponse<ListTypeOf<T>>>,
  transformer: (obj: object) => T,
  handler: (event: TypedV1WatchEvent<T>) => boolean | void,
  expectAbort: boolean = true,
): Promise<string | void> => {
  let lastResourceVersion = resourceVersion;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await watch(
      lister({ resourceVersion: lastResourceVersion, watch: true, allowWatchBookmarks: true }),
      transformer,
      handler,
      lastResourceVersion,
      expectAbort,
    );
    if (!res) {
      return;
    }
    lastResourceVersion = res;
  }
};


/*
 * XXX after we become comfortable with raising ootb support to 1.31,
 * use watch-list, which can reduce number of request, and avoid abort on fetch
 * itself since there should always be initial event if we expect list to be
 * non-empty (e.g. watchUntil on a created resource)
 */

export const listAndUnwaitedWatch = async<T extends KubernetesObject> (
  dest: Ref<Array<T>>,
  transformer: (obj: object) => T,
  lister: (opt: WatchOpt) => Promise<ApiResponse<KubernetesList<T>>>,
  catcher: Parameters<Promise<void>['catch']>[0],
) => {
  const listResponse = await (await lister({})).value();
  dest.value = listResponse.items;

  retryingWatch(
    listResponse.metadata!.resourceVersion!,
    lister,
    transformer,
    watchArrayHandler(dest),
  ).catch(catcher);
};

// abortion is expected to be handled downstream for timeout
export const watchUntil = async<T extends KubernetesObject> (
  lister: (opt: WatchOpt) => Promise<ApiResponse<KubernetesList<T>>>,
  transformer: (obj: object) => T,
  condition: (e: TypedV1WatchEvent<T>) => boolean,
) => {
  const listResponse = await (await lister({})).value();
  for (const i of listResponse.items) {
    if (condition({ type: V1WatchEventType.ADDED, object: i })) {
      return;
    }
  }

  await retryingWatch(
    listResponse.metadata!.resourceVersion!,
    lister,
    transformer,
    condition,
    false,
  );
};

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

  retryingWatch(
    listResponse.metadata!.resourceVersion!,
    lister,
    tableTransformer,
    watchTableHandler(dest),
  ).catch(catcher);
};
