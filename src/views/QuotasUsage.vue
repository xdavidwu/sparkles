<script lang="ts" setup>
import { VCard, VCardText } from 'vuetify/components';
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import { useApiConfig } from '@/stores/apiConfig';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { CoreV1Api, type V1ResourceQuota, V1ResourceQuotaFromJSON } from '@/kubernetes-api/src';
import { uniqueKeyForObject } from '@/utils/objects';
import { listAndWatch } from '@/utils/watch';

const { selectedNamespace } = storeToRefs(useNamespaces());

const quotas = ref<Array<V1ResourceQuota>>([]);

let abortController: AbortController | null = null;

watch(selectedNamespace, async (namespace) => {
  if (!namespace || namespace.length === 0) {
    quotas.value = [];
    return;
  }
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  const api = new CoreV1Api(await useApiConfig().getConfig());
  listAndWatch(quotas, V1ResourceQuotaFromJSON,
    (opt) => api.listNamespacedResourceQuotaRaw(opt, { signal: abortController!.signal }),
    { namespace })
      .catch((e) => useErrorPresentation().pendingError = e);
}, { immediate: true });
</script>

<template>
  <!-- TODO: mark scoped quotas -->
  <VCard v-for="quota in quotas" :key="uniqueKeyForObject(quota)"
    :title="quota.metadata!.name" class="mb-4"><VCardText>
    <template v-for="(value, key) of quota.spec!.hard" :key="key">
      {{ key }}: {{ quota.status!.used![key] }}/{{ value }}
      <br>
    </template>
  </VCardText></VCard>
  <template v-if="!quotas.length">
    No quota enforcement found in this namespace.
  </template>
</template>
