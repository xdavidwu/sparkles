<script lang="ts" setup>
import XTerm from '@/components/XTerm.vue';
import { onUnmounted } from 'vue';
import type { Terminal } from '@xterm/xterm';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api, V1StatusFromJSON } from '@/kubernetes-api/src';
import { ExtractedRequestContext, extractRequestContext } from '@/utils/api';
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

enum Streams {
  STDIN = 0,
  STDOUT = 1,
  STDERR = 2,
  ERROR = 3,
  RESIZE = 4,
  CLOSE = 255,
}

let socket: WebSocket | null = null;

const commandOpts = (props.command ?? ['/bin/sh', '-c', findShell]).reduce(
  (a, v) => `${a}&command=${encodeURIComponent(v)}`, '');

const base64url = (s: string) => btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\\/g, '_');
const configStore = useApiConfig();
const token = await configStore.getBearerToken();
const api = new CoreV1Api(await configStore.getConfig());

let url = '';
try {
  // XXX naming?
  await api.withPreMiddleware(extractRequestContext).connectGetNamespacedPodExec({
    namespace: props.containerSpec.namespace,
    name: props.containerSpec.pod,
    container: props.containerSpec.container,
    stdin: true,
    stdout: true,
    tty: true,
  });
} catch (e) {
  if (e instanceof ExtractedRequestContext) {
    url = `${e.context.url}${commandOpts}`.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  } else {
    throw e;
  }
}

const encoder = new TextEncoder();

const display = async (terminal: Terminal) => {
  terminal.write('Connecting...');

  // k8s.io/kubelet/pkg/cri/streaming/remotecommand.createWebSocketStreams
  socket = new WebSocket(url, token ? supportedProtocols.concat([
    // https://github.com/kubernetes/kubernetes/pull/47740
    `base64url.bearer.authorization.k8s.io.${base64url(token)}`
  ]) : supportedProtocols);
  socket.binaryType = 'arraybuffer';
  socket.onerror = (event) => {
    useErrorPresentation().pendingError = new PresentedError(
      `WebSocket connetion to ${(event.target! as WebSocket).url} failed`);
  };

  const resize = (t: { cols: number, rows: number }) => {
    socket!.send(new Uint8Array([ Streams.RESIZE,
      ...encoder.encode(`{"Width":${t.cols},"Height":${t.rows}}\n`)]));
  };

  const CSI = '\x1b[';
  socket.onopen = () => {
    resize(terminal);
    terminal.write(`${CSI}2J${CSI}H`); // clear all, reset cursor
    terminal.onData((data) => {
      socket!.send(new Uint8Array([Streams.STDIN, ...encoder.encode(data)]));
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
    if (socket.protocol === wsstreamV5Channel) {
      // XXX: there seems to be no way to close underlying tty?
      socket.send(new Uint8Array([Streams.CLOSE, Streams.STDIN]));
    }

    socket.close();
  }
});
</script>

<template>
  <XTerm @ready="display" />
</template>
