<script lang="ts" setup>
import { VCard } from 'vuetify/components';
import LinkedTooltip from '@/components/LinkedTooltip.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import QuotaDoughnut from '@/components/QuotaDoughnut.vue';
import { computed, ref, watch } from 'vue';
import { useAbortController } from '@/composables/abortController';
import { useLoading } from '@/composables/loading';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import { useApiConfig } from '@/stores/apiConfig';
import {
  CoreV1Api,
  type V1ResourceQuota, V1ResourceQuotaFromJSON,
  type V1PersistentVolumeClaim, V1PersistentVolumeClaimFromJSON,
  type V1Pod, V1PodFromJSON,
} from '@xdavidwu/kubernetes-client-typescript-fetch';
import { V1PodStatusPhase } from '@/utils/api';
import { excludeFromVisualizationLabel } from '@/utils/contracts';
import { listAndUnwaitedWatch } from '@/utils/watch';
import { notifyListingWatchErrors } from '@/utils/errors';
import { real } from '@ragnarpa/quantity';

const namespacesStore = useNamespaces();
await namespacesStore.ensureNamespaces;
const { selectedNamespace } = storeToRefs(namespacesStore);

const api = new CoreV1Api(await useApiConfig().getConfig());

const _quotas = ref<Array<V1ResourceQuota>>([]);

// aliases
// k8s.io/kubernetes/pkg/quota/v1/evaluator/core.podComputeUsageHelper()
const aliases = {
  'cpu': 'requests.cpu',
  'memory': 'requests.memory',
  'ephemeral-storage': 'requests.ephemeral-storage',
  // hugepages-* => requests.hugepages-*

  // object counts
  'pods': 'count/pods', // actually contains additional rules
  'services': 'count/services',
  'replicationcontrollers': 'count/replicationcontrollers',
  'resourcequotas': 'count/resourcequotas',
  'secrets': 'count/secrets',
  'configmaps': 'count/configmaps',
  'persistentvolumeclaims': 'count/persistentvolumeclaims',
};
const aliased = (id: string): id is keyof typeof aliases => Object.keys(aliases).includes(id);

const displayNames = {
  'cpu': 'CPU',
  'memory': 'Memory',
  'ephemeral-storage': 'Ephemeral storage',
  'storage': 'Storage',
};
const nameOverriden = (name: string): name is keyof typeof displayNames => Object.keys(displayNames).includes(name);

const quotas = computed(() => _quotas.value.map((quota) => {
  const parsed: { [key: string]: { [key: string]: { name: string, value: string, used: string } } } = {};
  for (const id in quota.spec!.hard) {
    const canonical = aliased(id) ? aliases[id] :
      id.startsWith('hugepages-') ? `requests.${id}` : id;

    let name, category;
    if (canonical.startsWith('limits.')) {
      name = canonical.substring(7);
      category = 'Limits';
    } else if (canonical.startsWith('requests.')) {
      name = canonical.substring(9);
      category = 'Requests';
    } else if (canonical.endsWith('.storageclass.storage.k8s.io/requests.storage')) {
      name = `Storage in class ${canonical.substring(0, canonical.length - 45)}`;
      category = 'Requests';
    } else if (canonical === 'services.loadbalancers') {
      name = 'services of type LoadBalancer';
      category = 'Object counts for core API';
    } else if (canonical === 'services.nodeports') {
      name = 'services of type NodePort';
      category = 'Object counts for core API';
    } else if (canonical.startsWith('count/')){
      name = canonical.substring(6);
      const dot = name.indexOf('.');
      if (dot != -1) {
        // TODO query plurals back to kind?
        category = `Object count for group ${name.substring(dot + 1)}`;
        name = name.substring(0, dot);
      } else {
        category = 'Object counts for core API';
      }
    } else {
      // TODO support DRA
      name = canonical;
      category = 'Unknown';
    }
    name = nameOverriden(name) ? displayNames[name] : name;

    parsed[category] ??= {};
    parsed[category][canonical] = {
      name,
      value: quota.spec!.hard[id],
      used: quota.status?.used?.[id] ?? '0',
    };
  }

  const scoped: boolean = !!(quota.spec!.scopeSelector || quota.spec!.scopes?.length);
  return {
    name: quota.metadata!.name,
    parsed,
    scoped,
  };
}));

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
  return res;
});

const pvcs = ref<Array<V1PersistentVolumeClaim>>([]);
const pvcsResourceUsage = computed(() => {
  const res: { [key: string]: { [key: string]: number } } = { 'requests.storage': {} };
  pvcs.value.forEach((pvc) => {
    // k8s.io/kubernetes/pkg/quota/v1/evaluator/core.pvcEvaluator.getStorageUsage()
    const fromSpec = real(pvc.spec!.resources!.requests!.storage)!;
    // behind RecoverVolumeExpansionFailure
    const allocated = real(pvc.status?.allocatedResources?.storage ?? '0')!;
    const usage = allocated > fromSpec ? allocated : fromSpec;

    res['requests.storage'][pvc.metadata!.name!] = usage;

    // k8s.io/component-helpers/storage/volume.GetPersistentVolumeClaimClass()
    const sc = pvc.metadata!.annotations?.['volume.beta.kubernetes.io/storage-class'] ??
      pvc.spec!.storageClassName;
    if (sc) {
      const id = `${sc}.storageclass.storage.k8s.io/requests.storage`;
      res[id] ??= {};
      res[id][pvc.metadata!.name!] = usage;
    }
  });
  return res;
});

const { abort: abortRequests, signal } = useAbortController();

const { load, loading } = useLoading(async () => {
  abortRequests();

  await Promise.all([
    listAndUnwaitedWatch(_quotas, V1ResourceQuotaFromJSON,
      (opt) => api.listNamespacedResourceQuotaRaw({
        ...opt,
        namespace: selectedNamespace.value,
        labelSelector: `${excludeFromVisualizationLabel}!=true`,
      }, { signal: signal.value }),
      notifyListingWatchErrors,
    ),
    listAndUnwaitedWatch(pods, V1PodFromJSON,
      (opt) => api.listNamespacedPodRaw({
        ...opt,
        namespace: selectedNamespace.value,
        fieldSelector: `status.phase!=${V1PodStatusPhase.FAILED},status.phase!=${V1PodStatusPhase.SUCCEEDED}`,
      }, { signal: signal.value }),
      notifyListingWatchErrors,
    ),
    listAndUnwaitedWatch(pvcs, V1PersistentVolumeClaimFromJSON,
      (opt) => api.listNamespacedPersistentVolumeClaimRaw({
        ...opt,
        namespace: selectedNamespace.value,
      }, { signal: signal.value }),
      notifyListingWatchErrors,
    ),
  ]);
});
await load();

watch(selectedNamespace, load);
</script>

<template>
  <LoadingSpinner v-if="loading" />
  <div v-else class="d-flex flex-wrap ga-4">
    <VCard v-for="quota in quotas" :key="quota.name">
      <template #title>
        {{ quota.name }}
        <span v-if="quota.scoped">
          (scoped)
          <LinkedTooltip activator="parent" text="Covers only resources under certain conditions." />
        </span>
      </template>
      <template #text>
        <template v-for="(rules, category) of quota.parsed"
          :key="category">
          <div class="text-subtitle-1 pb-2 pt-4">{{ category }}</div>
          <div class="d-flex justify-space-evenly align-center flex-wrap ga-2 px-4">
            <QuotaDoughnut v-for="({ name, value, used }, key) of rules" :key="key"
              :title="name" :used="real(used)!" :total="real(value)!"
              :details="quota.scoped ? undefined : (podsResourceUsage[key] ?? pvcsResourceUsage[key])">
              {{ used }}/{{ value }}
            </QuotaDoughnut>
          </div>
        </template>
      </template>
    </VCard>
    <template v-if="!quotas.length">
      No quota enforcement found in this namespace.
    </template>
  </div>
</template>
