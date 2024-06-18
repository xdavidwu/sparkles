import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { type ChartVersion, type IndexFile } from '@/utils/helm';
import { parse } from 'yaml';
import { satisfies } from 'semver';

export const useHelmRepository = defineStore('helmRepository', () => {
  const charts = shallowRef<Array<ChartVersion>>([]);
  const repo = `${window.__base_url}charts`;
  const indexURL = `${repo}/index.yaml`;

  const loadIndex = async () => {
    const response = await fetch(indexURL);
    const text = await response.text();
    let index: IndexFile;
    try {
      index = JSON.parse(text);
    } catch {
      index = parse(text);
    }

    const versionInfo = await useApisDiscovery().getVersionInfo();
    // TODO support versioning?
    const c = Object.keys(index.entries).map((k) => index.entries[k][0])
      .filter((c) => c.type != 'library')
      .filter((c) => c.deprecated != true)
      .filter((c) => c.kubeVersion ? satisfies(versionInfo.gitVersion, c.kubeVersion) : true);
    c.forEach((c) => c.keywords?.sort());
    charts.value = c;
  };

  const loadPromise = loadIndex().catch((e) => useErrorPresentation().pendingError = e);

  return { ensureIndex: loadPromise, charts };
});
