<script lang="ts" setup>
import XTerm from '@/components/XTerm.vue';
import type { Terminal } from '@xterm/xterm';
// @ts-expect-error Missing type definitions
import { openpty } from 'xterm-pty';
import { useAbortController } from '@/composables/abortController';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { errorIsAborted, rawErrorIsAborted } from '@/utils/api';
import { streamToGenerator } from '@/utils/lang';

const props = defineProps<{
  containerSpec: {
    namespace: string,
    pod: string,
    container: string,
  },
  previous?: boolean,
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
      previous: props.previous,
    }, {
      signal: signal.value,
    })).raw.body!.pipeThrough(new TextDecoderStream());
  } catch (e) {
    if (errorIsAborted(e)) {
      return;
    }
    throw e;
  }

  try {
    for await (const data of streamToGenerator(response)) {
      slave.write(data);
    }
  } catch (e) {
    if (rawErrorIsAborted(e)) {
      return;
    }
    throw e;
  }
};
</script>

<template>
  <XTerm :xterm-options="opts" @ready="display" />
</template>
