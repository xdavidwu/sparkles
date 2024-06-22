import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { PresentedError } from '@/utils/PresentedError';
import { type ChartVersion, type IndexFile } from '@/utils/helm';
import { parse } from 'yaml';
import { satisfies } from 'semver';

export const useHelmRepository = defineStore('helmRepository', () => {
  const charts = ref<Array<ChartVersion>>([]);
  const repo = `${window.__base_url}charts`;
  const indexURL = `${repo}/index.yaml`;

  const loadIndex = async () => {
    const response = await fetch(indexURL);
    const text = await response.text();
    let index: IndexFile;
    try {
      index = JSON.parse(text);
    } catch {
      try {
        index = parse(text);
      } catch (e) {
        // a guess for SPA fallback html
        if (response.headers.get('Content-Type') == 'text/html') {
          throw new PresentedError(`Failed to obtain Helm repo index at ${indexURL}, maybe it isn't set up by instance admin yet?`);
        }
        throw e;
      }
    }

    const versionInfo = await useApisDiscovery().getVersionInfo();
    // TODO support versioning?
    const c = Object.values(index.entries).map((versions) => versions[0])
      .filter((c) => c.type != 'library')
      .filter((c) => c.deprecated != true)
      .filter((c) => c.kubeVersion ? satisfies(versionInfo.gitVersion, c.kubeVersion) : true);
    c.forEach((c) => c.keywords?.sort());
    charts.value = c;
  };

  const loadPromise = loadIndex().catch((e) => useErrorPresentation().pendingError = e);

  return { ensureIndex: loadPromise, charts };
});
