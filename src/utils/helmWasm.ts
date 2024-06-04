import { useApiConfig } from '@/stores/apiConfig';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import type { Chart } from '@/utils/helm';
import '@/vendor/wasm_exec';

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
interface Capabilities {
  KubeVersion: {
    Version: string,
    Major: string,
    Minor: string,
  },
  APIVersions: Array<string>,
}

let goInitialized = false;

export const setup = async () => {
  if (goInitialized) {
    return;
  }
  const config = useApiConfig();
  const token = await config.getBearerToken();

  const go = new Go();
  const wasm = await WebAssembly.instantiateStreaming(
    fetch(`${window.__base_url}helm.wasm`), go.importObject);
  go.run(wasm.instance);
  goInitialized = true;

  _helm_configConnection({
    basePath: config.fullApiBasePath,
    accessToken: token,
    impersonation: config.impersonation,
  });
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
  };
};

export const renderTemplate = async (chart: Array<Chart>, value: object, opts: ReleaseOptions) => {
  await setup();
  const result = await _helm_renderTemplate(
    chart.map((c) => JSON.stringify(c)),
    JSON.stringify(value),
    JSON.stringify(opts),
    JSON.stringify(await capabilitiesFromDiscovery()),
  );
  return result;
};
