<script lang="ts" setup>
import { VTable } from 'vuetify/components';
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useNamespaces } from '@/stores/namespaces';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api, type V1Pod } from '@/kubernetes-api/src';
import { uniqueKeyForObject } from '@/utils/keys';

const { selectedNamespace } = storeToRefs(useNamespaces());

const pods = ref<Array<V1Pod>>([]);

watch(selectedNamespace, async (namespace) => {
  const api = new CoreV1Api(await useApiConfig().getConfig());
  pods.value = (await api.listNamespacedPod({ namespace })).items;
}, { immediate: true });
</script>

<template>
  <VTable hover>
    <thead>
      <tr>
        <th>Pod name</th>
        <th>Container name</th>
        <th>Container image</th>
        <th>Readiness</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <template v-for="pod in pods" :key="uniqueKeyForObject(pod)">
        <tr v-for="(container, index) in pod.spec.containers"
          :key="container.name">
          <td v-if="index === 0" :rowspan="pod.spec.containers.length">
            {{ pod.metadata!.name }}
          </td>
          <td>{{ container.name }}</td>
          <td>{{ container.image }}</td>
          <td>{{ pod.status.containerStatuses[index].ready }}</td>
          <td>actions</td>
        </tr>
      </template>
    </tbody>
  </VTable>
</template>
