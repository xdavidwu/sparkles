<script lang="ts" setup>
import 'xterm/css/xterm.css';
import { onMounted } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@/kubernetes-api/src';

const props = defineProps<{
  containerSpec: {
    namespace: string,
    pod: string,
    container: string,
  },
}>();

const uuid = uuidv4();
const terminal = new Terminal();
const fitAddon = new FitAddon();
const decoder = new TextDecoder();

terminal.loadAddon(fitAddon);

onMounted(async () => {
  const div = document.getElementById(uuid)!;
  terminal.open(div);
  fitAddon.fit();
  new ResizeObserver(() => fitAddon.fit()).observe(div);

  const config = await useApiConfig().getConfig();
  const response = (await new CoreV1Api(config).readNamespacedPodLogRaw({
    namespace: props.containerSpec.namespace,
    name: props.containerSpec.pod,
    container: props.containerSpec.container,
    follow: true,
  })).raw.body!.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await response.read();

    if (done) {
      break;
    }

    terminal.write(decoder.decode(value!).replace(/\n/g, '\r\n'));
  }
});
</script>

<template>
  <div :id="uuid">
  </div>
</template>
