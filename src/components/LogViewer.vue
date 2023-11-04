<script lang="ts" setup>
import XTerm from '@/components/XTerm.vue';
import { onUnmounted } from 'vue';
import type { Terminal } from 'xterm';
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
const abortController = new AbortController();

const display = async (terminal: Terminal) => {
  const config = await useApiConfig().getConfig();
  const response = (await new CoreV1Api(config).readNamespacedPodLogRaw({
    namespace: props.containerSpec.namespace,
    name: props.containerSpec.pod,
    container: props.containerSpec.container,
    follow: true,
  }, { signal: abortController.signal })).raw.body!.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await response.read();

    if (done) {
      break;
    }

    terminal.write(decoder.decode(value!).replace(/\n/g, '\r\n'));
  }
};

onUnmounted(() => {
  abortController.abort();
});
</script>

<template>
  <XTerm @ready="display" />
</template>
