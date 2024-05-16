import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { watchArray } from '@vueuse/core';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api, type V1Namespace, V1NamespaceFromJSON } from '@/kubernetes-api/src';
import { listAndUnwaitedWatch } from '@/utils/watch';

export const useNamespaces = defineStore('namespace', () => {
  const _namespaces = ref<Array<V1Namespace>>([]);
  let _updatePromise: Promise<void> | null = null;
  const namespaces = computed(() => _namespaces.value.map((v) => v.metadata!.name!));
  const selectedNamespace = ref('');
  const loading = ref(true);

  const setDefaultNamespace = (namespaces: Array<string>) => {
    if (namespaces.length) {
      if (namespaces.indexOf('default') !== -1) {
        selectedNamespace.value = 'default';
      } else {
        selectedNamespace.value = namespaces[0];
      }
    } else {
      throw new Error('No namespaces available');
    }
  }

  const rejectUnsetNamespace = computed({
    get: () => selectedNamespace.value,
    set: (v) => v && (selectedNamespace.value = v),
  });

  const ensureNamespaces = () => {
    if (!_updatePromise) {
      _updatePromise = (async () => {
        const config = await useApiConfig().getConfig();
        const api = new CoreV1Api(config);
        await listAndUnwaitedWatch(
          _namespaces,
          V1NamespaceFromJSON,
          (opt) => api.listNamespaceRaw(opt),
          {},
          (e) => useErrorPresentation().pendingError = e,
        )
        setDefaultNamespace(namespaces.value);
        loading.value = false;
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

  return { namespaces, selectedNamespace: rejectUnsetNamespace, loading, ensureNamespaces };
});
