import { useApiConfig } from '@/stores/apiConfig';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { AnyApi } from '@/utils/AnyApi';
import type { V2APIGroupDiscovery } from '@/utils/discoveryV2';
import type { Chart } from '@/utils/helm';
import helmWasmInit from '@/utils/helm.wasm?init';
import '@/vendor/wasm_exec';

declare function _helm_renderTemplate(charts: Array<string>, values: string, options: string, capabilities: string, api: AnyApi): Promise<{ [key: string]: string }>;

// helm.sh/v3/pkg/chartutils.ReleaseOptions
export interface ReleaseOptions {
  Name: string,
  Namespace: string,
  Revision: number,
  IsUpgrade: boolean,
  IsInstall: boolean,
}

// helm.sh/v3/pkg/chartutils.ReleaseOptions
// HelmVersion is filled in go
// Groups is our own raw data
interface Capabilities {
  KubeVersion: {
    Version: string,
    Major: string,
    Minor: string,
  },
  APIVersions: Array<string>,
  Groups: Array<V2APIGroupDiscovery>,
}

let goInitialized = false;

export const setup = async () => {
  if (goInitialized) {
    return;
  }
  const go = new Go();
  const wasm = await helmWasmInit(go.importObject);
  go.run(wasm);
  goInitialized = true;
};

const capabilitiesFromDiscovery = async (): Promise<Capabilities> => {
  const store = useApisDiscovery();
  const [versionInfo, groups] = await Promise.all([store.getVersionInfo(), store.getGroups()]);
  const gv = groups.map((g) =>
    g.versions.map((v) => g.metadata?.name ? `${g.metadata.name}/${v.version}` : v.version),
  ).reduce((a, v) => a.concat(v), []);
  const gvk = groups.map((g) =>
    g.versions.map((v) => v.resources.map(
      (r) => g.metadata?.name ? `${g.metadata.name}/${v.version}/${r.responseKind.kind}` : `${v.version}/${r.responseKind.kind}`,
    )).reduce((a, v) => a.concat(v), []),
  ).reduce((a, v) => a.concat(v), []);
  return {
    KubeVersion: {
      Version: versionInfo.gitVersion,
      Major: versionInfo.major,
      Minor: versionInfo.minor,
    },
    APIVersions: gv.concat(gvk),
    Groups: groups,
  };
};

export const renderTemplate = async (chart: Array<Chart>, value: object, opts: ReleaseOptions) => {
  await setup();
  const result = await _helm_renderTemplate(
    chart.map((c) => JSON.stringify(c)),
    JSON.stringify(value),
    JSON.stringify(opts),
    JSON.stringify(await capabilitiesFromDiscovery()),
    new AnyApi(await useApiConfig().getConfig()),
  );
  return result;
};
