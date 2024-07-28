import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useLocalStorage, watchArray } from '@vueuse/core';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useApiConfig } from '@/stores/apiConfig';
import { CoreV1Api, type V1Namespace, V1NamespaceFromJSON } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { listAndUnwaitedWatch } from '@/utils/watch';

export const useNamespaces = defineStore('namespace', () => {
  const _namespaces = ref<Array<V1Namespace>>([]);
  const namespaces = computed(() => _namespaces.value.map((v) => v.metadata!.name!));
  const selectedNamespace = useLocalStorage('namespace', 'default');
  const loading = ref(true);

  const setDefaultNamespace = () => {
    if (namespaces.value.length) {
      selectedNamespace.value = namespaces.value.includes('default') ? 'default'
        : namespaces.value[0];
    } else {
      throw new Error('No namespaces available');
    }
  }

  const rejectUnsetNamespace = computed({
    get: () => selectedNamespace.value,
    set: (v) => v && (selectedNamespace.value = v),
  });

  const ensureNamespaces = (async () => {
    const config = await useApiConfig().getConfig();
    const api = new CoreV1Api(config);
    await listAndUnwaitedWatch(
      _namespaces,
      V1NamespaceFromJSON,
      (opt) => api.listNamespaceRaw(opt),
      (e) => {
        console.log(e);
        useErrorPresentation().pendingToast = 'Watching for namespaces changes failed,\nnamespace listing will not be updated until a full page reload.';
      },
    )
    loading.value = false;
  })().catch((e) => useErrorPresentation().pendingError = e);

  watchArray(namespaces, (newNamespaces, old, added, removed) => {
    if (removed.indexOf(selectedNamespace.value) !== -1 ||
        (old.length == 0 && !newNamespaces.includes(selectedNamespace.value))) {
      useErrorPresentation().pendingToast = `Namespace ${selectedNamespace.value} deleted on server`;
      setDefaultNamespace();
    }
  });

  return { namespaces, selectedNamespace: rejectUnsetNamespace, loading, ensureNamespaces };
});
