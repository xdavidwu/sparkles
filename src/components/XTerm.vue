<script lang="ts" setup>
import 'xterm/css/xterm.css';
import { ref, onMounted } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

const emit = defineEmits<{
  (e: 'ready', terminal: Terminal): void,
}>();

const div = ref<HTMLDivElement | null>(null);
const terminal = new Terminal();
const fitAddon = new FitAddon();

terminal.loadAddon(fitAddon);

onMounted(async () => {
  terminal.open(div.value!);
  fitAddon.fit();
  new ResizeObserver(() => fitAddon.fit()).observe(div.value!);
  emit('ready', terminal);
});
</script>

<template>
  <div ref="div">
  </div>
</template>
