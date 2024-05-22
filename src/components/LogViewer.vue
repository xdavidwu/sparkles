<script lang="ts" setup>
import XTerm from '@/components/XTerm.vue';
import type { Terminal } from '@xterm/xterm';
// @ts-expect-error Missing type definitions
import { openpty } from 'xterm-pty';
import { useAbortController } from '@/composables/abortController';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@/kubernetes-api/src';
import { errorIsAborted, rawErrorIsAborted } from '@/utils/api';

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

const { master, slave } = openpty();

const display = async (terminal: Terminal) => {
  terminal.loadAddon(master);
  terminal.textarea!.disabled = true;

  const config = await useApiConfig().getConfig();
  let response;
  try {
    response = (await new CoreV1Api(config).readNamespacedPodLogRaw({
      namespace: props.containerSpec.namespace,
      name: props.containerSpec.pod,
      container: props.containerSpec.container,
      follow: true,
    }, {
      signal: signal.value,
    })).raw.body!.pipeThrough(new TextDecoderStream()).getReader();
  } catch (e) {
    if (errorIsAborted(e)) {
      return;
    }
    throw e;
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await response.read().catch((e) => {
      if (rawErrorIsAborted(e)) {
        return { value: '', done: true };
      }
      throw e;
    });

    if (done) {
      break;
    }

    slave.write(value);
  }
};
</script>

<template>
  <XTerm :xterm-options="opts" @ready="display" />
</template>
