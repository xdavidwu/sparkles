import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { watchArray } from '@vueuse/core';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api, type V1Namespace, V1NamespaceFromJSON } from '@/kubernetes-api/src';
import { listAndWatch } from '@/utils/watch';

export const useNamespaces = defineStore('namespace', () => {
  const _namespaces = ref<Array<V1Namespace>>([]);
  let _updatePromise: Promise<void> | null = null;

  const namespaces = computed(() => {
      if (!_updatePromise) {
        _updatePromise = (async () => {
          const config = await useApiConfig().getConfig();
          const api = new CoreV1Api(config);
          await listAndWatch(_namespaces, V1NamespaceFromJSON,
            (opt) => api.listNamespaceRaw(opt), {}, false);
        })().catch((e) => useErrorPresentation().pendingError = e);
      }

      return _namespaces.value.map((v) => v.metadata!.name!);
  });

  const selectedNamespace = ref('');

  watchArray(namespaces, (newNamespaces, old, added, removed) => {
    if (old.length === 0 || removed.indexOf(selectedNamespace.value) === -1) {
      // TODO fire a notification on removed?
      if (newNamespaces.length) {
        if (newNamespaces.indexOf('default') !== -1) {
          selectedNamespace.value = 'default';
        } else {
          selectedNamespace.value = newNamespaces[0];
        }
      } else {
        selectedNamespace.value = '';
      }
    }
  });

  return { namespaces, selectedNamespace };
});
