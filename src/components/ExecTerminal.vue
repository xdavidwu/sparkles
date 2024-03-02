<script lang="ts" setup>
import XTerm from '@/components/XTerm.vue';
import { onUnmounted } from 'vue';
import type { Terminal } from '@xterm/xterm';
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

const findShell = 'for i in /bin/bash /bin/sh; do [ -x "$i" ] && exec "$i"; done';
const wsstreamV4Channel = 'v4.channel.k8s.io';
const wsstreamV5Channel = 'v5.channel.k8s.io';
const supportedProtocols = [
  wsstreamV5Channel,
  wsstreamV4Channel,
];

let socket: WebSocket | null = null;

const commandOpts = (props.command ?? ['/bin/sh', '-c', findShell]).reduce(
  (a, v) => `${a}&command=${encodeURIComponent(v)}`, '');
const url = `/api/v1/namespaces/${props.containerSpec.namespace}/pods/${props.containerSpec.pod}/exec?container=${encodeURIComponent(props.containerSpec.container)}&stdout=true&stdin=true&tty=true${commandOpts}`;

const base64url = (s: string) => btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\\/g, '_');
const configStore = useApiConfig();

const display = async (terminal: Terminal) => {
  terminal.write('Connecting...');

  const token = await configStore.getBearerToken();
  const socketBase = configStore.fullApiBasePath
    .replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

  // https://github.com/kubernetes/kubernetes/blob/master/staging/src/k8s.io/kubelet/pkg/cri/streaming/remotecommand/websocket.go
  socket = new WebSocket(`${socketBase}${url}`, token ? supportedProtocols.concat([
    // https://github.com/kubernetes/kubernetes/pull/47740
    `base64url.bearer.authorization.k8s.io.${base64url(token)}`
  ]) : supportedProtocols);
  socket.binaryType = 'arraybuffer';
  socket.onerror = (event) => {
    useErrorPresentation().pendingError = new PresentedError(
      `WebSocket connetion to ${(event.target! as WebSocket).url} failed`);
  };

  const resize = (t: { cols: number, rows: number }) => {
    socket!.send(`\x04{"Width":${t.cols},"Height":${t.rows}}\n`);
  };

  const CSI = '\x1b[';
  socket.onopen = () => {
    resize(terminal);
    terminal.write(`${CSI}2J${CSI}H`); // clear all, reset cursor
    terminal.onData((data) => {
      socket!.send(`\x00${data}`);
    });
    terminal.onResize(resize);
  };
  socket.onmessage = (event) => {
    const data = new Uint8Array(event.data);
    const stream = data[0];
    if (stream === 1 || stream === 2) {
      terminal.write(data.subarray(1));
    } else if (stream === 3) {
      // https://github.com/kubernetes/kubernetes/blob/master/staging/src/k8s.io/kubelet/pkg/cri/streaming/remotecommand/httpstream.go
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

      socket!.close();
    }
  };
};

onUnmounted(() => {
  if (socket) {
    // TODO v5.channel.k8s.io added support for closing streams (stdin)
    // https://github.com/kubernetes/kubernetes/pull/119157 landed v1.29
    // but not actually wired up yet @ kubelet (https://github.com/kubernetes/kubernetes/issues/122263)
    // thus this is not tested
    if (socket.protocol === wsstreamV5Channel) {
      socket.send("\xff\x00");
    }

    socket.close();
  }
});
</script>

<template>
  <XTerm @ready="display" />
</template>
