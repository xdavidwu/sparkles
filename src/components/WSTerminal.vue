<script lang="ts" setup>
import XTerm from '@/components/XTerm.vue';
import { onUnmounted } from 'vue';
import type { Terminal } from '@xterm/xterm';
import { useApiConfig } from '@/stores/apiConfig';
import { V1StatusFromJSON } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { V1StatusStatus } from '@/utils/api';
import { PresentedError } from '@/utils/PresentedError';
import { useErrorPresentation } from '@/stores/errorPresentation';

const props = defineProps<{
  url: string,
  initialMessage?: Uint8Array,
  // XXX? attach exit seems not to reflect status on cri-o
  noExitStatus?: boolean,
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const wsstreamV4Channel = 'v4.channel.k8s.io';
const wsstreamV5Channel = 'v5.channel.k8s.io';
const supportedProtocols = [
  wsstreamV5Channel,
  wsstreamV4Channel,
];

enum Streams {
  STDIN = 0,
  STDOUT = 1,
  STDERR = 2,
  ERROR = 3,
  RESIZE = 4,
  CLOSE = 255,
}

const base64url = (s: string) => btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\\/g, '_');
const configStore = useApiConfig();
const token = await configStore.getBearerToken();
const encoder = new TextEncoder();

const display = async (terminal: Terminal) => {
  terminal.write('Connecting...');

  // k8s.io/kubelet/pkg/cri/streaming/remotecommand.createWebSocketStreams
  const socket = new WebSocket(props.url, token ? supportedProtocols.concat([
    // https://github.com/kubernetes/kubernetes/pull/47740
    `base64url.bearer.authorization.k8s.io.${base64url(token)}`
  ]) : supportedProtocols);
  socket.binaryType = 'arraybuffer';
  socket.onerror = (event) => {
    useErrorPresentation().pendingError = new PresentedError(
      `WebSocket connetion to ${(event.target as WebSocket).url} failed`,
      { cause: event },
    );
  };

  const resize = (t: { cols: number, rows: number }) => {
    socket.send(new Uint8Array([ Streams.RESIZE,
      ...encoder.encode(`{"Width":${t.cols},"Height":${t.rows}}\n`)]));
  };

  const CSI = '\x1b[';
  socket.onopen = () => {
    resize(terminal);
    terminal.write(`${CSI}2J${CSI}H`); // clear all, reset cursor
    if (props.initialMessage) {
      socket.send(new Uint8Array([Streams.STDIN, ...props.initialMessage]));
    }
    terminal.onData((data) => {
      socket.send(new Uint8Array([Streams.STDIN, ...encoder.encode(data)]));
    });
    terminal.onResize(resize);
  };
  socket.onmessage = (event) => {
    const data = new Uint8Array(event.data);
    const stream = data[0];
    if (stream === Streams.STDOUT || stream === Streams.STDERR) {
      terminal.write(data.subarray(1));
    } else if (stream === Streams.ERROR) {
      // k8s.io/kubelet/pkg/cri/streaming/remotecommand.v4WriteStatusFunc
      const status = V1StatusFromJSON(JSON.parse(
        new TextDecoder().decode(data.subarray(1))
      ));

      terminal.write(`${CSI}0m`); // SGR reset
      if (status.status === V1StatusStatus.SUCCESS) {
        terminal.write(props.noExitStatus ?
          // SGR: fg: cyan
          `${CSI}36mcommand terminated` :
          // SGR: fg: green
          `${CSI}32mcommand terminated normally`);
      } else {
        terminal.write(`${CSI}31m`); // SGR: fg: red
        terminal.write(status.message ?? status.reason!);
      }
      terminal.write(`${CSI}?25l`); // unset mode: cursor visible

      socket.close();
      emit('close');
    }
  };

  onUnmounted(() => {
    if (socket.protocol === wsstreamV5Channel) {
      // XXX: there seems to be no way to close underlying tty?
      socket.send(new Uint8Array([Streams.CLOSE, Streams.STDIN]));
    }

    socket.close();
  });
};
</script>

<template>
  <XTerm @ready="display" />
</template>
