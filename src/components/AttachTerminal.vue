<script lang="ts" setup>
import WSTerminal from '@/components/WSTerminal.vue';
import { onUnmounted } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { CoreV1Api, V1PodFromJSON } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { extractUrl, V1WatchEventType } from '@/utils/api';
import { watchUntil } from '@/utils/watch';

const props = defineProps<{
  containerSpec: {
    namespace: string,
    pod: string,
    container: string,
  },
  // ensure prompt is visible, should only be used on first connection
  shell?: boolean,
}>();

const emit = defineEmits<{
  (e: 'terminate'): void;
}>();

const initialMessage = props.shell ?
  new TextEncoder().encode('printf \'\\033[1;1H\\033[0J\'\n') : undefined;

const configStore = useApiConfig();
const api = new CoreV1Api(await configStore.getConfig());
const url = (await extractUrl(api, (api) => api.connectGetNamespacedPodAttach({
  namespace: props.containerSpec.namespace,
  name: props.containerSpec.pod,
  container: props.containerSpec.container,
  stdin: true,
  stdout: true,
  tty: true,
}))).replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');

const abortController = new AbortController();

const checkStatus = async () => {
  await watchUntil(
    (opt) => api.listNamespacedPodRaw({
      namespace: props.containerSpec.namespace,
      fieldSelector: `metadata.name=${props.containerSpec.pod}`,
      ...opt
    }, { signal: abortController.signal }),
    V1PodFromJSON,
    (ev) => {
      if (ev.type === V1WatchEventType.ADDED ||
          ev.type === V1WatchEventType.MODIFIED) {
        const status = ev.object.status;
        const nameMatch = (s: { name: string }) => s.name === props.containerSpec.container;
        const terminationStatus = (
          status?.containerStatuses?.find(nameMatch) ??
          status?.initContainerStatuses?.find(nameMatch) ??
          status?.ephemeralContainerStatuses?.find(nameMatch)
        )?.state?.terminated;
        const terminated = !!terminationStatus;
        if (terminated && terminationStatus.reason != 'Completed') {
          useErrorPresentation().pendingToast =
            terminationStatus.reason == 'Error' ?
              `Container terminated with code ${terminationStatus.exitCode}.`:
              `Container terminated due to ${terminationStatus.reason}.`;
        }
        return terminated;
      }
      return ev.type === V1WatchEventType.DELETED;
    },
    true,
  );
  emit('terminate');
};

onUnmounted(() => abortController.abort());
</script>

<template>
  <WSTerminal :url="url" :initial-message="initialMessage" no-exit-status
    @close="checkStatus" />
</template>
