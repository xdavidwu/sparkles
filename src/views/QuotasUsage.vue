<script lang="ts" setup>
import { VCard } from 'vuetify/components';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import QuotaDoughnut from '@/components/QuotaDoughnut.vue';
import { computed, ref, watch } from 'vue';
import { useAbortController } from '@/composables/abortController';
import { useLoading } from '@/composables/loading';
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
import { listAndUnwaitedWatch } from '@/utils/watch';
import { real } from '@ragnarpa/quantity';

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces;
const { selectedNamespace } = storeToRefs(namespacesStore);

const api = new CoreV1Api(await useApiConfig().getConfig());

const quotas = ref<Array<V1ResourceQuota>>([]);
const pods = ref<Array<V1Pod>>([]);
// k8s.io/kubernetes/pkg/quota/v1/evaluator/core.QuotaV1Pod()
// .status.phase is filtered by fieldSelector
const eligiblePods = computed(() => pods.value.filter((p) => {
  // terminating
  if (p.metadata?.deletionTimestamp && p.metadata?.deletionGracePeriodSeconds) {
    if (Date.now() > p.metadata.deletionTimestamp.valueOf() + p.metadata.deletionGracePeriodSeconds * 1000) {
      return false;
    }
  }
  return true;
}));
const podsResourceUsage = computed(() => {
  const res: { [key: string]: { [key: string]: number } } = {};
  eligiblePods.value.forEach((pod) => {
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
  // k8s.io/kubernetes/pkg/quota/v1/evaluator/core.podComputeUsageHelper()
  res['cpu'] = res['requests.cpu'];
  res['memory'] = res['requests.memory'];
  res['ephemeral-storage'] = res['requests.ephemeral-storage'];

  for (const quotaId in res) {
    if (quotaId.startsWith('requests.hugepages-')) {
      res[quotaId.substring(9)] = res[quotaId];
    }
  }
  return res;
});

const { abort: abortRequests, signal } = useAbortController();

const { load, loading } = useLoading(async () => {
  abortRequests();

  await Promise.all([
    listAndUnwaitedWatch(quotas, V1ResourceQuotaFromJSON,
      (opt) => api.listNamespacedResourceQuotaRaw({ ...opt, namespace: selectedNamespace.value }, { signal: signal.value }),
      (e) => useErrorPresentation().pendingError = e,
    ),
    listAndUnwaitedWatch(pods, V1PodFromJSON,
      (opt) => api.listNamespacedPodRaw({
        ...opt,
        namespace: selectedNamespace.value,
        fieldSelector: 'status.phase!=Failed,status.phase!=Succeeded',
      }, { signal: signal.value }),
      (e) => useErrorPresentation().pendingError = e,
    ),
  ]);
});
await load();

watch(selectedNamespace, load);
</script>

<!-- TODO: mark scoped quotas -->
<template>
  <LoadingSpinner v-if="loading" />
  <div v-else class="d-flex align-center flex-wrap ga-4">
    <VCard v-for="quota in quotas" :key="uniqueKeyForObject(quota)"
      :title="quota.metadata!.name">
      <template #text>
        <div class="d-flex justify-space-evenly align-center flex-wrap ga-8 px-8">
          <QuotaDoughnut v-for="(value, key) of quota.spec!.hard" :key="key"
            :title="key as string" :details="podsResourceUsage[key]"
            :used="real(quota.status!.used![key])!" :total="real(value)!">
            {{ quota.status!.used![key] }}/{{ value }}
          </QuotaDoughnut>
        </div>
      </template>
    </VCard>
    <template v-if="!quotas.length">
      No quota enforcement found in this namespace.
    </template>
  </div>
</template>
