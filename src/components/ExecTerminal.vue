<script lang="ts" setup>
import 'xterm/css/xterm.css';
import { onMounted } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useApiConfig } from '@/stores/apiConfig';
import { V1StatusFromJSON } from '@/kubernetes-api/src';

const props = defineProps<{
  containerSpec: {
    namespace: string,
    pod: string,
    container: string,
  },
  command?: string,
}>();

const emit = defineEmits<{
  // eslint-disable-next-line no-unused-vars
  (e: 'titleChanged', title: string): void,
  // eslint-disable-next-line no-unused-vars
  (e: 'bell'): void,
}>();

const uuid = uuidv4();
const terminal = new Terminal();
const url = `/api/v1/namespaces/${props.containerSpec.namespace}/pods/${props.containerSpec.pod}/exec?container=${encodeURIComponent(props.containerSpec.container)}&stdout=true&stdin=true&tty=true`;
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.onTitleChange((title) => emit('titleChanged', title));
terminal.onBell(() => emit('bell'));

const base64url = (s: string) => btoa(s).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\\/g, '_');

onMounted(async () => {
  const div = document.getElementById(uuid)!;
  terminal.open(div);
  fitAddon.fit();
  terminal.write('Connecting...');
  const config = await useApiConfig().getConfig();
  const token = await useApiConfig().getBearerToken();
  const socketBase = config.basePath.replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://');
  const fullUrl = `${socketBase}${url}&command=${encodeURIComponent(props.command ?? '/bin/sh')}`;

  // https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/cri/streaming/remotecommand/websocket.go
  const socket = new WebSocket(fullUrl, token ? [
    // https://github.com/kubernetes/kubernetes/pull/47740
    'v4.channel.k8s.io', `base64url.bearer.authorization.k8s.io.${base64url(token)}`
  ] : 'v4.channel.k8s.io');
  socket.binaryType = 'arraybuffer';
  const CSI = '\x1b[';
  socket.onopen = () => {
    socket.send(`\x04{Width:${terminal.cols},Height:${terminal.rows}}`);
    terminal.write(`${CSI}2J${CSI}H`); // clear all, reset cursor
    fitAddon.fit();
    new ResizeObserver(() => fitAddon.fit()).observe(div);
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
});
</script>

<template>
  <div :id="uuid">
  </div>
</template>
