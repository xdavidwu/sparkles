<script lang="ts" setup>
import XTerm from '@/components/XTerm.vue';
import type { Terminal } from 'xterm';
import { useApiConfig } from '@/stores/apiConfig';
import { V1StatusFromJSON } from '@/kubernetes-api/src';
import { PresentedError } from '@/utils/PresentedError';
import { useErrorPresentation } from '@/stores/errorPresentation';

const props = defineProps<{
  containerSpec: {
    namespace: string,
    pod: string,
    container: string,
  },
  command?: Array<string>,
}>();

const emit = defineEmits<{
  // eslint-disable-next-line no-unused-vars
  (e: 'titleChanged', title: string): void,
  // eslint-disable-next-line no-unused-vars
  (e: 'bell'): void,
}>();

const findShell = 'for i in /bin/bash /bin/sh; do if [ -x "$i" ]; then "$i"; break; fi; done';

let commandOpts = '';
for (const i of props.command ?? ['/bin/sh', '-c', findShell]) {
  commandOpts = `${commandOpts}&command=${encodeURIComponent(i)}`;
}
const url = `/api/v1/namespaces/${props.containerSpec.namespace}/pods/${props.containerSpec.pod}/exec?container=${encodeURIComponent(props.containerSpec.container)}&stdout=true&stdin=true&tty=true${commandOpts}`;

const base64url = (s: string) => btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\\/g, '_');

const display = async (terminal: Terminal) => {
  terminal.onTitleChange((title) => emit('titleChanged', title));
  terminal.onBell(() => emit('bell'));
  terminal.write('Connecting...');

  const config = await useApiConfig().getConfig();
  const token = await useApiConfig().getBearerToken();
  const socketBase = config.basePath.replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://');
  const fullUrl = `${socketBase}${url}`;

  // https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/cri/streaming/remotecommand/websocket.go
  const socket = new WebSocket(fullUrl, token ? [
    // https://github.com/kubernetes/kubernetes/pull/47740
    'v4.channel.k8s.io',
    `base64url.bearer.authorization.k8s.io.${base64url(token)}`
  ] : 'v4.channel.k8s.io');
  socket.binaryType = 'arraybuffer';
  socket.onerror = (event) => {
    useErrorPresentation().pendingError = new PresentedError(
      `WebSocket connetion to ${(event.target! as WebSocket).url} failed`);
  };

  const CSI = '\x1b[';
  socket.onopen = () => {
    socket.send(`\x04{Width:${terminal.cols},Height:${terminal.rows}}`);
    terminal.write(`${CSI}2J${CSI}H`); // clear all, reset cursor
    terminal.onData((data) => {
      socket.send(`\x00${data}`);
    });
  };
  socket.onmessage = (event) => {
    const data = new Uint8Array(event.data);
    const stream = data[0];
    if (stream === 1 || stream === 2) {
      terminal.write(data.subarray(1));
    } else if (stream === 3) {
      // https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/cri/streaming/remotecommand/httpstream.go
      const status = V1StatusFromJSON(JSON.parse(
        new TextDecoder().decode(data.subarray(1))
      ));

      terminal.write(`${CSI}0m`); // SGR reset
      if (status.status === 'Success') {
        // SGR: fg: green
        terminal.write(`${CSI}32mcommand terminated normally`);
      } else {
        terminal.write(`${CSI}31m`); // SGR: fg: red
        terminal.write(status.message ?? status.reason!);
      }
      terminal.write(`${CSI}?25l`); // unset mode: cursor visible

      socket.close();
    }
  };
};
</script>

<template>
  <XTerm @ready="display" />
</template>
