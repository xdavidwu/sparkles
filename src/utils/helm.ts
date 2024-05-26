// XXX: why omitempty everywhere?

// helm.sh/helm/v3/pkg/release.Info
export interface Info {
  first_deployed?: string;
  last_deployed?: string;
  deleted?: string;
  description?: string; // TODO is this always set?
  status?: string; // TODO is this always set?
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
export interface Release {
  name: string;
  info: Info;
  chart: Chart;
  config: object;
  manifest: string;
  hooks?: Array<any>; // TODO
  version: number;
  namespace: string;
}

export interface ReleaseWithLabels extends Release {
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
