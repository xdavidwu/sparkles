<script lang="ts" setup>
import 'xterm/css/xterm.css';
import { onMounted } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { Terminal } from 'xterm';
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

const uuid = uuidv4();
const terminal = new Terminal();
const url = `/api/v1/namespaces/${props.containerSpec.namespace}/pods/${props.containerSpec.pod}/exec?container=${encodeURIComponent(props.containerSpec.container)}&stdout=true&stdin=true&tty=true`;

onMounted(async () => {
  terminal.open(document.getElementById(uuid));
  terminal.write('Connecting...');
  const config = await useApiConfig().getConfig();
  const socketBase = config.basePath.replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://');
  const fullUrl = `${socketBase}${url}&command=${encodeURIComponent(props.command ?? '/bin/sh')}`;

  // TODO auth
  // https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/cri/streaming/remotecommand/websocket.go
  const socket = new WebSocket(fullUrl, 'v4.channel.k8s.io');
  const CSI = '\x1b[';
  socket.onopen = () => {
    terminal.write(`${CSI}2J${CSI}H`); // clear all, reset cursor
    terminal.onData((data) => {
      socket.send(`\x00${data}`);
    });
  };
  socket.onmessage = async (event) => {
    const data = new Uint8Array(await event.data.arrayBuffer());
    const stream = data[0];
    console.log('data on stream ', stream, data);
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
        terminal.write(status.message ?? status.reason);
      }
      terminal.write(`${CSI}?25l`); // unset mode: cursor visible
      console.log(status);

      socket.close();
    }
  };
});
</script>

<template>
  <div :id="uuid">
  </div>
</template>
