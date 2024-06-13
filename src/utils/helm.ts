import type { V1Secret } from '@/kubernetes-api/src';
import type { KubernetesObject } from '@/utils/objects';
import { streamToGenerator } from '@/utils/lang';
import type { InboundMessage, OutboundMessage } from '@/utils/helm.webworker';
import { handleApiConfigMessages } from '@/utils/apiConfig';
import HelmWorker from '@/utils/helm.webworker?worker';
import { extract } from 'it-tar';
import { parse } from 'yaml';

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
  lock?: Lock;
  templates: Array<File>;
  values: object;
  schema?: string; // base64'd json schema
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
  hooks?: Array<unknown>; // TODO
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
    `data:application/octet-stream;base64,${atob(s.data!.release!)}`,
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

// helm.sh/v3/pkg/chart/loader.LoadFiles
// deps are in private fields, not deserializable, do parse but handle them in go
const loadChartsFromFiles = async (rawFiles: { [name: string]: Blob }): Promise<Chart[]> => {
  const extractFile = (name: string) => {
    const data = rawFiles[name];
    if (data) {
      delete rawFiles[name];
    }
    return data;
  };
  const optionalYaml = async (name: string) => {
    const data = extractFile(name);
    if (!data) {
      return;
    }
    return parse(await data.text());
  };
  const base64 = async (b: Blob) => btoa(Array.from(
    new Uint8Array(await b.arrayBuffer()),
    (b) => String.fromCodePoint(b),
  ).join(''));
  const optionalBase64 = async (name: string) => {
    const data = extractFile(name);
    return data ? await base64(data) : undefined;
  };
  const extractSerializedFile = async (name: string) =>
    ({ name, data: await base64(extractFile(name))});

  const subcharts: { [name: string]: typeof rawFiles } = {};
  const parsedSubcharts: Array<Chart> = [];

  await Promise.all(Object.keys(rawFiles).sort().filter((n) => n.startsWith('charts/')).map(async (n) => {
    const data = extractFile(n);
    const name = n.substring(7);
    if (name.endsWith('.tgz')) {
      parsedSubcharts.push(...await parseChartTarball(await data.stream()));
      return;
    }
    if (!name.includes('/')) {
      return;
    }
    const parts = name.split('/');
    subcharts[parts[0]] ??= {};
    subcharts[parts[0]][name.substring(parts[0].length + 1)] = data;
  }));

  (await Promise.all(Object.keys(subcharts).map((name) => loadChartsFromFiles(subcharts[name]))))
    .forEach((charts) => parsedSubcharts.push(...charts));

  return [
    {
      metadata: parse(await extractFile('Chart.yaml').text()),
      lock: await optionalYaml('Chart.lock'),
      values: await optionalYaml('values.yaml'),
      schema: await optionalBase64('values.schema.json'),
      templates: await Promise.all(Object.keys(rawFiles)
        .filter((n) => n.startsWith('templates/')).map(extractSerializedFile)),
      files: await Promise.all(Object.keys(rawFiles).map(extractSerializedFile)),
    },
    ...parsedSubcharts,
  ];
};

// helm.sh/v3/pkg/chart/loader.LoadArchive
export const parseChartTarball = async (s: ReadableStream): Promise<Chart[]> => {
  const unzipped = s.pipeThrough(new DecompressionStream('gzip'));
  const rawFiles: { [name: string]: Blob } = {};
  for await (const entry of extract()(streamToGenerator(unzipped))) {
    const drain = async () => {
      // always drain the body, or entry iterator will get stuck
      // eslint-disable-next-line
      for await (const _ of entry.body) {}
    };

    if (entry.header.type != 'file') {
      await drain();
      continue;
    }

    const d = entry.header.name.includes('\\') ? '\\' : '/';
    const parts = entry.header.name.split(d);
    if (parts.length < 2) {
      await drain();
      continue;
    }
    const name = parts.slice(1).join('/');
    // @ts-expect-error fromAsync will be available in 5.5
    rawFiles[name] = new Blob(await Array.fromAsync(entry.body));
  }
  return await loadChartsFromFiles(rawFiles);
};

let worker: Worker | null = null;

const prepareWorker = () => {
  if (worker == null) {
    worker = new HelmWorker();
  }
  return worker;
};

export const testWorkerRoundTrip = () => {
  const worker = prepareWorker();
  const handlers = [
    handleApiConfigMessages(worker),
  ];
  worker.onmessage = async (e) => {
    for (const handler of handlers) {
      if (await handler(e)) {
        return;
      }
    }
    const data: OutboundMessage = e.data;
    if (data.type == 'error') {
      throw data.error;
    }
  };
  const op: InboundMessage = {
    type: 'call',
    func: 'test',
    args: ['foo', 'bar', 'baz'],
  };
  worker.postMessage(op);
};
