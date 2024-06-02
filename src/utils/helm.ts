import type { V1Secret } from '@/kubernetes-api/src';
import type { KubernetesObject } from '@/utils/objects';

// XXX: why omitempty everywhere?

// helm.sh/helm/v3/pkg/release.Status
export enum Status {
  UNKNOWN = "unknown",
  DEPLOYED = "deployed",
  UNINSTALLED = "uninstalled",
  SUPERSEDED = "superseded",
  FAILED = "failed",
  UNINSTALLING = "uninstalling",
  PENDING_INSTALL = "pending-install",
  PENDING_UPGRADE = "pending-upgrade",
  PENDING_ROLLBACK = "pending-rollback",
}

// helm.sh/helm/v3/pkg/release.Info
export interface Info {
  first_deployed?: string;
  last_deployed?: string;
  deleted?: string;
  description?: string; // TODO is this always set?
  status?: Status; // TODO is this always set?
  notes?: string;
  resources?: object; // TODO is this even used now? Release.manifest?
}

// helm.sh/helm/v3/pkg/chart.Dependency
export interface Dependency {
  name: string;
  version?: string;
  repository?: string;
  condition?: string;
  tags?: Array<string>;
  enabled?: boolean;
  'import-values': Array<unknown>;
  alias?: string;
}

// helm.sh/helm/v3/pkg/chart.Metadata
export interface Metadata {
  name: string;
  home?: string;
  sources?: Array<string>;
  version: string;
  description?: string;
  keywords?: Array<string>;
  maintainers?: Array<{
    name?: string;
    email?: string;
    url?: string;
  }>;
  icon?: string; // url
  apiVersion: string;
  condition?: string;
  tags?: string;
  appVersion?: string; // TODO is this always set?
  deprecated?: boolean;
  annotations?: {
    [key: string]: string;
  };
  kubeVersion?: string;
  dependencies?: Array<Dependency>;
  type?: string;
}

// helm.sh/helm/v3/pkg/chart.File
export interface File {
  name: string;
  data: string; // base64'd
}

// helm.sh/helm/v3/pkg/chart.Lock
export interface Lock {
  generated: string;
  digest: string;
  dependencies: Array<Dependency>;
}

// helm.sh/helm/v3/pkg/chart.Chart
export interface Chart {
  metadata: Metadata;
  lock: Lock;
  templates: Array<File>;
  values: object;
  schema: string; // base64'd json schema
  files: Array<File>;
}

// helm.sh/helm/v3/pkg/release.Release
// labels are serialized externally
export interface ReleaseWithoutLabels {
  name: string;
  info: Info;
  chart: Chart;
  config: object;
  manifest: string;
  hooks?: Array<any>; // TODO
  version: number;
  namespace: string;
}

export interface Release extends ReleaseWithoutLabels {
  labels: {
    [key: string]: string;
  };
}

// helm.sh/helm/v3/pkg/repo.ChartVersion
export interface ChartVersion extends Metadata {
  urls: Array<string>;
  created?: string;
  removed?: boolean;
  digest?: string;
}

// helm.sh/helm/v3/pkg/repo.IndexFile
export interface IndexFile {
  serverInfo?: object;
  apiVersion: string;
  generated: string;
  entries: {
    [key: string]: Array<ChartVersion>;
  };
  publicKeys?: Array<string>;
  annotations: {
    [key: string]: string;
  };
}

// helm.sh/helm/v3/pkg/storage/driver.Secrets.List
export const secretsLabelSelector = 'owner=helm';
export const releaseSecretType = 'helm.sh/release.v1';
export const parseSecret = async (s: V1Secret): Promise<Release> => {
  // TODO handle malformed secrets
  const gzipped = (await fetch(
    `data:application/octet-stream;base64,${atob(s.data?.release!)}`,
  )).body!;
  const stream = gzipped.pipeThrough(new DecompressionStream('gzip'));

  const release: Release = await (new Response(stream)).json();

  return {
    ...release,
    labels: s.metadata!.labels ?? {},
  };
};

// helm.sh/helm/v3/pkg/storage/driver.Secrets.newSecretsObject
export const encodeSecret = async (r: Release): Promise<V1Secret> => {
  const datum = {
    ...r,
    labels: undefined,
  };
  const bytes = new Blob([JSON.stringify(datum)]);
  const stream = bytes.stream().pipeThrough(new CompressionStream('gzip'));
  const gzipped = new Uint8Array(await (new Response(stream)).arrayBuffer());
  const base64d = btoa(Array.from(gzipped, (b) => String.fromCodePoint(b)).join(''));

  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: `sh.helm.release.v1.${r.name}.v${r.version}`,
      namespace: r.namespace,
      labels: {
        ...r.labels,
        name: r.name,
        owner: 'helm',
        status: r.info.status!,
        version: `${r.version}`,
      },
    },
    data: {
      release: btoa(base64d),
    },
    type: releaseSecretType,
  };
};

// helm.sh/v3/pkg/kube.ResourcePolicyAnno, KeepPolicy
export const shouldKeepResource = (r: KubernetesObject) =>
  r.metadata?.annotations?.['helm.sh/resource-policy'] === 'keep';
