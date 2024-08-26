<script lang="ts" setup>
import '@xterm/xterm/css/xterm.css';
import { ref, onMounted } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

const props = defineProps<{
  xtermOptions?: ConstructorParameters<typeof Terminal>[0],
}>();

const emit = defineEmits<{
  (e: 'bell'): void,
  (e: 'ready', terminal: Terminal): void,
  (e: 'titleChanged', title: string): void,
}>();

const div = ref<HTMLDivElement | undefined>();
const terminal = new Terminal(props.xtermOptions);
const fitAddon = new FitAddon();

terminal.loadAddon(fitAddon);
terminal.loadAddon(new WebLinksAddon());

onMounted(async () => {
  terminal.open(div.value!);
  fitAddon.fit();
  new ResizeObserver(() => fitAddon.fit()).observe(div.value!);
  terminal.onBell(() => emit('bell'));
  terminal.onTitleChange((title) => emit('titleChanged', title));
  emit('ready', terminal);
});
</script>

<template>
  <div ref="div" class="bg-black"
    style="touch-action: pan-x pinch-zoom; overflow: clip" />
</template>

<style scoped>
:deep(.xterm-rows span) {
  pointer-events: none;
}
</style>
