<script lang="ts" setup>
import { VCard, VCardText } from 'vuetify/components';
import QuotaDoughnut from '@/components/QuotaDoughnut.vue';
import { computed, ref, watch } from 'vue';
import { useAbortController } from '@/composables/abortController';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import { useApiConfig } from '@/stores/apiConfig';
import { useErrorPresentation } from '@/stores/errorPresentation';
import {
  CoreV1Api,
  type V1ResourceQuota, V1ResourceQuotaFromJSON,
  type V1Pod, V1PodFromJSON,
} from '@/kubernetes-api/src';
import { uniqueKeyForObject } from '@/utils/objects';
import { listAndWatch } from '@/utils/watch';
import { real } from '@ragnarpa/quantity';

const { selectedNamespace } = storeToRefs(useNamespaces());

const quotas = ref<Array<V1ResourceQuota>>([]);
const pods = ref<Array<V1Pod>>([]);
const podsResourceUsage = computed(() => {
  const res = {} as { [key: string]: { [key: string]: number } };
  pods.value.forEach((pod) => {
    pod.spec!.containers.forEach((container) => {
      const identifier = `${pod.metadata!.name}/${container.name}`;
      const resources = container.resources;

      for (const type in resources?.limits) {
        const quotaId = `limits.${type}`;

        res[quotaId] ??= {};
        res[quotaId][identifier] = real(resources!.limits[type])!;
      }

      for (const type in resources?.requests) {
        const quotaId = `requests.${type}`;

        res[quotaId] ??= {};
        res[quotaId][identifier] = real(resources!.requests[type])!;
      }
    });
  });

  // aliases
  // https://kubernetes.io/docs/concepts/policy/resource-quotas/#compute-resource-quota
  res['cpu'] = res['requests.cpu'];
  res['memory'] = res['requests.memory'];
  return res;
});

const { abort: abortRequests, signal } = useAbortController();

watch(selectedNamespace, async (namespace) => {
  if (!namespace || namespace.length === 0) {
    quotas.value = [];
    return;
  }
  abortRequests();

  const api = new CoreV1Api(await useApiConfig().getConfig());
  listAndWatch(quotas, V1ResourceQuotaFromJSON,
    (opt) => api.listNamespacedResourceQuotaRaw(opt, { signal: signal.value }),
    { namespace })
      .catch((e) => useErrorPresentation().pendingError = e);

  listAndWatch(pods, V1PodFromJSON,
    (opt) => api.listNamespacedPodRaw(opt, { signal: signal.value }),
    { namespace })
      .catch((e) => useErrorPresentation().pendingError = e);
}, { immediate: true });
</script>

<template>
  <!-- TODO: mark scoped quotas -->
  <VCard v-for="quota in quotas" :key="uniqueKeyForObject(quota)"
    :title="quota.metadata!.name" class="mb-4">
    <VCardText class="d-flex justify-center justify-space-evenly align-center flex-wrap">
      <QuotaDoughnut v-for="(value, key) of quota.spec!.hard" :key="key"
        class="my-2" :title="key as string" :details="podsResourceUsage[key]"
        :used="real(quota.status!.used![key])!" :total="real(value)!">
        {{ quota.status!.used![key] }}/{{ value }}
      </QuotaDoughnut>
    </VCardText>
  </VCard>
  <template v-if="!quotas.length">
    No quota enforcement found in this namespace.
  </template>
</template>
