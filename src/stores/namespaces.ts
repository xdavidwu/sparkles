import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { watchArray } from '@vueuse/core';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api, type V1Namespace, V1NamespaceFromJSON } from '@/kubernetes-api/src';
import { watch as kubernetesWatch } from '@/utils/watch';

export const useNamespaces = defineStore('namespace', () => {
  const _namespaces = ref<Array<V1Namespace>>([]);
  let _updatePromise: Promise<void> | null = null;
  const namespaces = computed(() => _namespaces.value.map((v) => v.metadata!.name!));
  const selectedNamespace = ref('');

  const setDefaultNamespace = (namespaces: Array<string>) => {
    if (namespaces.length) {
      if (namespaces.indexOf('default') !== -1) {
        selectedNamespace.value = 'default';
      } else {
        selectedNamespace.value = namespaces[0];
      }
    } else {
      selectedNamespace.value = '';
    }
  }

  const ensureNamespaces = () => {
    if (!_updatePromise) {
      _updatePromise = (async () => {
        const config = await useApiConfig().getConfig();
        const api = new CoreV1Api(config);
        const res = await api.listNamespace();
        _namespaces.value = res.items;
        setDefaultNamespace(namespaces.value);

        kubernetesWatch(
          _namespaces,
          V1NamespaceFromJSON,
          () => api.listNamespaceRaw({ resourceVersion: res.metadata!.resourceVersion, watch: true }),
        ).catch((e) => useErrorPresentation().pendingError = e);
      })().catch((e) => useErrorPresentation().pendingError = e);
    }
    return _updatePromise;
  }

  ensureNamespaces();

  watchArray(namespaces, (newNamespaces, old, added, removed) => {
    if (old.length === 0 || removed.indexOf(selectedNamespace.value) !== -1) {
      // TODO fire a notification on removed?
      setDefaultNamespace(newNamespaces);
    }
  });

  return { namespaces, selectedNamespace, ensureNamespaces };
});
