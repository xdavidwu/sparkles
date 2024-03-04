<script lang="ts" setup>
import XTerm from '@/components/XTerm.vue';
import type { Terminal } from '@xterm/xterm';
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

const opts = {
  disableStdin: true,
};

const { signal } = useAbortController();

const display = async (terminal: Terminal) => {
  terminal.textarea!.disabled = true;
  const config = await useApiConfig().getConfig();
  const response = (await new CoreV1Api(config).readNamespacedPodLogRaw({
    namespace: props.containerSpec.namespace,
    name: props.containerSpec.pod,
    container: props.containerSpec.container,
    follow: true,
  }, { signal: signal.value })).raw.body!.pipeThrough(new TextDecoderStream()).getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await response.read().catch((e) => {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return { value: '', done: true };
      }
      throw e;
    });

    if (done) {
      break;
    }

    // termios(3) c_oflag=OPOST|ONLCR
    terminal.write(value.replace(/\n/g, '\r\n'));
  }
};
</script>

<template>
  <XTerm :xterm-options="opts" @ready="display" />
</template>
