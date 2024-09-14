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
  // ensure prompt is visible, should only be used on first connection
  shell?: boolean,
}>();

const initialMessage = props.shell ?
  new TextEncoder().encode('printf \'\\033[1;1H\\033[0J\'\n') : undefined;

const configStore = useApiConfig();
const api = new CoreV1Api(await configStore.getConfig());
const url = (await extractUrl(api, (api) => api.connectGetNamespacedPodAttach({
  namespace: props.containerSpec.namespace,
  name: props.containerSpec.pod,
  container: props.containerSpec.container,
  stdin: true,
  stdout: true,
  tty: true,
}))).replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
</script>

<template>
  <WSTerminal :url="url" :initial-message="initialMessage" no-exit-status />
</template>
