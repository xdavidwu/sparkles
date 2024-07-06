import type { V1Secret } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { streamToGenerator } from '@/utils/lang';
import { extract } from 'it-tar';
import { parse } from 'yaml';
// XXX: the library helm uses support v4,6,7, but codemirror-json-schema uses v4
import type { JSONSchema4 } from 'json-schema';

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
  // empty string when time.Time.IsZero via helm.sh/helm/v3/pkg/time.Time.MarshalJSON
  first_deployed: string;
  last_deployed: string;
  deleted: string;

  description: string; // unset in helm.sh/helm/v3/pkg/action/install.createRelease, but always set before persisting
  status: Status; // omitempty, but always set by helm
  notes?: string;
  // resources?: object; // used internally by helm.sh/helm/v3/pkg/action/status, never persisted in storage
}

// helm.sh/helm/v3/pkg/chart.Dependency
export interface Dependency {
  name: string;
  version?: string;
  repository: string;
  condition?: string;
  tags?: Array<string>;
  enabled?: boolean;
  'import-values': Array<unknown>;
  alias?: string;
}

// helm.sh/helm/v3/pkg/chart.Metadata
// omitempty everywhere, but loader does Chart.Validate
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
  appVersion?: string; // not always set
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
  data: ArrayBuffer;
}

// serialized variants are with unparsed base64 data,
// for operations on persisted releases, which usually don't need them
export interface SerializedFile extends Omit<File, 'data'> {
  data: string;
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
  schema?: ArrayBuffer;
  files: Array<File>;
}

export interface SerializedChart extends Omit<Chart, 'templates' | 'schema' | 'files'> {
  templates: Array<SerializedFile>;
  schema?: string;
  files: Array<SerializedFile>;
}

// helm.sh/helm/v3/pkg/release.HookEvent
export enum Event {
  PRE_INSTALL = 'pre-install',
  POST_INSTALL = 'post-install',
  PRE_DELETE = 'pre-delete',
  POST_DELETE = 'post-delete',
  PRE_UPGRADE = 'pre-upgrade',
  POST_UPGRADE = 'post-upgrade',
  PRE_ROLLBACK = 'pre-rollback',
  POST_ROLLBACK = 'post-rollback',
  TEST = 'test',
}

// helm.sh/helm/v3/pkg/release.HookPhase
export enum Phase {
  UNKNOWN = 'Unknown',
  RUNNING = 'Running',
  SUCCEEDED = 'Succeeded',
  FAILED = 'Failed',
}

// helm.sh/helm/v3/pkg/release.HookDeletePolicy
export enum DeletePolicy {
  SUCCEEDED = 'hook-succeeded',
  FAILED = 'hook-failed',
  BEFORE_HOOK_CREATION = 'before-hook-creation',
}

// helm.sh/helm/v3/pkg/release.Hook
export interface Hook {
  name: string;
  kind: string;
  path: string;
  manifest: string;
  events?: Array<Event>;
  last_run: {
    started_at: string;
    completed_at: string;
    phase: Phase;
  };
  weight: number;
  delete_policies?: Array<string>;
}

// helm.sh/helm/v3/pkg/release.Release
// labels are serialized externally
export interface ReleaseWithoutLabels {
  name: string;
  info: Info;
  chart: SerializedChart;
  config: object;
  manifest: string; // unset in helm.sh/helm/v3/pkg/action/install.createRelease, but always set before persisting
  hooks?: Array<Hook>;
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
  digest?: string; // sha256sum
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
export const secretName = (r: Release) => `sh.helm.release.v1.${r.name}.v${r.version}`;

export interface RawFiles {
  [name: string]: Blob;
}

// helm.sh/v3/pkg/chart/loader.LoadFiles
// deps are in private fields, not deserializable, do parse but handle them in go
export const loadChartsFromFiles = async (_rawFiles: RawFiles): Promise<Chart[]> => {
  const rawFiles = { ..._rawFiles };
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
  const optionalBuffer = async (name: string) => {
    const data = extractFile(name);
    return data ? await data.arrayBuffer() : undefined;
  };
  const extractAsFile = async (name: string) =>
    ({ name, data: await extractFile(name).arrayBuffer() });

  const subcharts: { [name: string]: typeof rawFiles } = {};
  const parsedSubcharts: Array<Chart> = [];

  await Promise.all(Object.keys(rawFiles).filter((n) => n.startsWith('charts/')).sort().map(async (n) => {
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

  parsedSubcharts.push(
    ...(await Promise.all(Object.values(subcharts).map((c) => loadChartsFromFiles(c))))
      .reduce((a, v) => a.concat(v), []));

  return [
    {
      metadata: parse(await extractFile('Chart.yaml').text()),
      lock: await optionalYaml('Chart.lock'),
      values: await optionalYaml('values.yaml'),
      schema: await optionalBuffer('values.schema.json'),
      templates: await Promise.all(Object.keys(rawFiles)
        .filter((n) => n.startsWith('templates/')).map(extractAsFile)),
      files: await Promise.all(Object.keys(rawFiles).map(extractAsFile)),
    },
    ...parsedSubcharts,
  ];
};

export const parseTarball = async (s: ReadableStream): Promise<RawFiles> => {
  const unzipped = s.pipeThrough(new DecompressionStream('gzip'));
  const rawFiles: RawFiles = {};
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
    rawFiles[name] = new Blob(await Array.fromAsync(entry.body));
  }
  return rawFiles;
};

// helm.sh/v3/pkg/chart/loader.LoadArchive
export const parseChartTarball = async (s: ReadableStream): Promise<Array<Chart>> =>
  await loadChartsFromFiles(await parseTarball(s));

const utf8Decoder = new TextDecoder();

const parseJSONBuffer = (b: ArrayBuffer) => JSON.parse(utf8Decoder.decode(b));

export const extractValuesSchema = (chart: Array<Chart>): JSONSchema4 => {
  const schemas: Array<JSONSchema4> = [];
  if (chart[0].schema) {
    schemas.push(parseJSONBuffer(chart[0].schema));
  }
  const subcharts = chart.slice(1);
  subcharts.forEach((c) => {
    if (c.schema) {
      const subschema = parseJSONBuffer(c.schema);
      schemas.push({
        type: 'object',
        properties: {
          [c.metadata.name]: subschema,
        },
      })
    }
  });
  if (schemas.length == 0) {
    return {};
  } else if (schemas.length == 1) {
    return schemas[0];
  } else {
    return { allOf: schemas };
  }
};
