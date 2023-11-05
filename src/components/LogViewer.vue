<script lang="ts" setup>
import XTerm from '@/components/XTerm.vue';
import type { Terminal } from 'xterm';
import { useAbortController } from '@/composables/abortController';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@/kubernetes-api/src';

const props = defineProps<{
  containerSpec: {
    namespace: string,
    pod: string,
    container: string,
  },
}>();

const decoder = new TextDecoder();
const { signal } = useAbortController();

const display = async (terminal: Terminal) => {
  const config = await useApiConfig().getConfig();
  const response = (await new CoreV1Api(config).readNamespacedPodLogRaw({
    namespace: props.containerSpec.namespace,
    name: props.containerSpec.pod,
    container: props.containerSpec.container,
    follow: true,
  }, { signal: signal.value })).raw.body!.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await response.read().catch((e) => {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { value: new Uint8Array(), done: true };
      }
      throw e;
    });

    if (done) {
      break;
    }

    terminal.write(decoder.decode(value!).replace(/\n/g, '\r\n'));
  }
};
</script>

<template>
  <XTerm @ready="display" />
</template>
