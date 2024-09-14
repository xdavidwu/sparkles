<script lang="ts" setup>
import WSTerminal from '@/components/WSTerminal.vue';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { extractUrl } from '@/utils/api';

const props = defineProps<{
  containerSpec: {
    namespace: string,
    pod: string,
    container: string,
  },
  command?: Array<string>,
}>();

const findShell = 'for i in /bin/bash /bin/sh; do [ -x "$i" ] && exec "$i"; done';
const commandOpts = (props.command ?? ['/bin/sh', '-c', findShell]).reduce(
  (a, v) => `${a}&command=${encodeURIComponent(v)}`, '');

const configStore = useApiConfig();
const api = new CoreV1Api(await configStore.getConfig());
const url = `${(await extractUrl(api, (api) => api.connectGetNamespacedPodExec({
  namespace: props.containerSpec.namespace,
  name: props.containerSpec.pod,
  container: props.containerSpec.container,
  stdin: true,
  stdout: true,
  tty: true,
})))}${commandOpts}`.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
</script>

<template>
  <WSTerminal :url="url" />
</template>
