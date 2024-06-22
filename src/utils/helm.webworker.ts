import {
  handleFnCall, progress,
  type FnCallInboundMessage, type FnCallOutboundMessage,
} from '@/utils/fnCall.webworker';
import {
  getConfig, getGroups, getVersionInfo, handleDataResponse,
  type RequestDataInboundMessage, type RequestDataOutboundMessage,
} from '@/utils/requestData.webworker';
import { CoreV1Api, type V1Secret, type VersionInfo } from '@/kubernetes-api/src';
import { AnyApi } from '@/utils/AnyApi';
import { errorIsResourceNotFound } from '@/utils/api';
import { parseAllDocuments } from 'yaml';
import { type Chart, type Release, Status } from '@/utils/helm';
import { type V2APIGroupDiscovery, resolveObject } from '@/utils/discoveryV2';
import { isSameKubernetesObject, type KubernetesObject } from '@/utils/objects';
import helmWasmInit from '@/utils/helm.wasm?init';
import '@/vendor/wasm_exec';

/*
 * fieldManager:
 * for generic, helm/pkg/kube client, helm uses "helm"
 * for client-go (which secrets driver uses), helm sets UA to `Helm/${version}`,
 * apiserver picks up Helm prefix
 *
 * secrets are fine (generally no mutation except setting Status.SUPERSEDED)
 * we should set fieldManager to helm on managed resources,
 * for interoperability with helm cli
 */
const fieldManager = 'helm';

declare function _helm_renderTemplate(charts: Array<string>, values: string, options: string, capabilities: string, api: AnyApi): Promise<{ [key: string]: string }>;

// helm.sh/v3/pkg/chartutils.ReleaseOptions
interface ReleaseOptions {
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

const setupGo = async () => {
  if (goInitialized) {
    return;
  }
  progress('Initializing WebAssembly');
  const go = new Go();
  const wasm = await helmWasmInit(go.importObject);
  go.run(wasm);
  goInitialized = true;
};

const capabilitiesFromDiscovery = (versionInfo: VersionInfo, groups: Array<V2APIGroupDiscovery>): Capabilities => {
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

const base64Buffer = (b: ArrayBuffer) =>
  btoa(Array.from(new Uint8Array(b), (b) => String.fromCodePoint(b)).join(''));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arrayBufferReplacer = (key: string, value: any): any => {
  if (value instanceof ArrayBuffer) {
    return base64Buffer(value);
  }
  return value;
};

const renderTemplate = async (chart: Array<Chart>, value: object, opts: ReleaseOptions) => {
  await setupGo();
  progress('Rendering resource templates');
  const result = await _helm_renderTemplate(
    chart.map((c) => JSON.stringify(c, arrayBufferReplacer)),
    JSON.stringify(value),
    JSON.stringify(opts),
    JSON.stringify(capabilitiesFromDiscovery(await getVersionInfo(), await getGroups())),
    new AnyApi(await getConfig()),
  );
  return result;
};

const releaseSecretType = 'helm.sh/release.v1';

// helm.sh/helm/v3/pkg/storage/driver.Secrets.newSecretsObject
const encodeSecret = async (r: Release): Promise<V1Secret> => {
  const datum = {
    ...r,
    labels: undefined,
  };
  const bytes = new Blob([JSON.stringify(datum)]);
  const stream = bytes.stream().pipeThrough(new CompressionStream('gzip'));
  const gzipped = await (new Response(stream)).arrayBuffer();
  const base64d = base64Buffer(gzipped);

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
const shouldKeepResource = (r: KubernetesObject) =>
  r.metadata?.annotations?.['helm.sh/resource-policy'] === 'keep';

const fns = {
  // helm.sh/helm/v3/pkg/action.Uninstall.Run
  uninstall: async (target: Release) => {
    progress('Marking release as uninstalling');

    const config = await getConfig();
    const api = new CoreV1Api(config);
    const anyApi = new AnyApi(config);

    target.info.status = Status.UNINSTALLING;
    target.info.deleted = (new Date()).toISOString();
    target.info.description = 'Deletion in progress (or sliently failed)';
    const updatedSecret = await encodeSecret(target);
    await api.replaceNamespacedSecret({
      namespace: updatedSecret.metadata!.namespace!,
      name: updatedSecret.metadata!.name!,
      body: updatedSecret,
    });

    progress('Parsing resources to delete');

    const targetResources: Array<KubernetesObject> = parseAllDocuments(target.manifest).map((d) => d.toJS());
    // TODO sort? helm.sh/helm/v3/pkg/releaseutil.UninstallOrder
    const toDelete = targetResources.filter((r) => !shouldKeepResource(r));

    progress('Deleting resources');

    await Promise.all(toDelete.map(async (r) => {
      const info = resolveObject(await getGroups(), r);
      await anyApi[`delete${info.scope!}CustomObject`]({
        group: info.group,
        version: info.version,
        plural: info.resource!,
        namespace: r.metadata!.namespace!,
        name: r.metadata!.name!,
      });
    }));

    // TODO perhaps tell user what are kept
    // TODO wait, hook

    progress('Marking release as uninstalled');

    target.info.status = Status.UNINSTALLED;
    target.info.description = 'Uninstallation complete';
    const finalSecret = await encodeSecret(target);
    await api.replaceNamespacedSecret({
      namespace: finalSecret.metadata!.namespace!,
      name: finalSecret.metadata!.name!,
      body: finalSecret,
    });
  },
  // helm.sh/helm/v3/pkg/action.Rollback.Run
  rollback: async (target: Release, releases: Array<Release>) => {
    progress('Creating new release');

    const config = await getConfig();
    const api = new CoreV1Api(config);
    const anyApi = new AnyApi(config);

    const latest = releases.filter((r) => r.name == target.name)[0];

    const release = structuredClone(target);
    release.info = {
      first_deployed: latest.info.first_deployed,
      last_deployed: (new Date()).toISOString(),
      status: Status.PENDING_ROLLBACK,
      notes: release.info.notes,
      description: `Rollback to ${release.version}`,
    };
    release.version = latest.version + 1;

    const secret = await encodeSecret(release);
    await api.createNamespacedSecret({ namespace: secret.metadata!.namespace!, body: secret });

    progress('Calculating rollback difference')

    const targetResources: Array<KubernetesObject> = parseAllDocuments(target.manifest).map((d) => d.toJS());
    const latestResources: Array<KubernetesObject> = parseAllDocuments(latest.manifest).map((d) => d.toJS());

    targetResources.forEach((r) => {
      if (!r.metadata!.annotations) {
        r.metadata!.annotations = {};
      }
      if (!r.metadata!.labels) {
        r.metadata!.labels = {};
      }
      r.metadata!.labels['app.kubernetes.io/managed-by'] = 'Helm';
      r.metadata!.annotations['meta.helm.sh/release-name'] = target.name;
      r.metadata!.annotations['meta.helm.sh/release-namespace'] = target.namespace;
    });

    const groups = await getGroups();

    const ops = await Promise.all(targetResources.map((r) => ({
      op: latestResources.some((t) => isSameKubernetesObject(r, t)) ? 'replace' : 'create',
      target: r,
    })).concat(latestResources.filter(
      (r) => !targetResources.some((t) => isSameKubernetesObject(r, t)) && !shouldKeepResource(r),
    ).map((r) => ({
      op: 'delete',
      target: r,
    }))).map(async (op) => ({
      ...op,
      kindInfo: resolveObject(groups, op.target),
    })));

    progress('Applying rollback');

    await Promise.all(ops.map(async (op) => {
      const create = () => anyApi[`create${op.kindInfo.scope!}CustomObject`]({
        group: op.kindInfo.group,
        version: op.kindInfo.version,
        plural: op.kindInfo.resource!,
        namespace: op.target.metadata!.namespace!,
        body: op.target,
        fieldManager,
      });
      switch (op.op) {
      case 'create':
        return await create();
      case 'replace':
        try {
          return await anyApi[`replace${op.kindInfo.scope!}CustomObject`]({
            group: op.kindInfo.group,
            version: op.kindInfo.version,
            plural: op.kindInfo.resource!,
            namespace: op.target.metadata!.namespace!,
            name: op.target.metadata!.name!,
            body: op.target,
            fieldManager,
          });
        } catch (e) {
          // some (apps/v1 Deployment) does not treat PUT without existing resource as create, but the others does
          if (await errorIsResourceNotFound(e)) {
            return await create();
          }
          throw e;
        }
      case 'delete':
        return await anyApi[`delete${op.kindInfo.scope!}CustomObject`]({
          group: op.kindInfo.group,
          version: op.kindInfo.version,
          plural: op.kindInfo.resource!,
          namespace: op.target.metadata!.namespace!,
          name: op.target.metadata!.name!,
        });
      }
    }));
    // TODO error handling, undo on failure?

    // TODO recreate? (delete old pod to trigger a rollout?), wait?, hooks?

    progress('Marking release statuses');

    await Promise.all(releases.filter(
      (r) => r.name == target.name && r.info.status == Status.DEPLOYED,
    ).map(async (r) => {
      r.info.status = Status.SUPERSEDED;
      const updatedSecret = await encodeSecret(r);
      return await api.replaceNamespacedSecret({
        namespace: updatedSecret.metadata!.namespace!,
        name: updatedSecret.metadata!.name!,
        body: updatedSecret,
      });
    }));

    release.info.status = Status.DEPLOYED;
    const finalSecret = await encodeSecret(release);
    await api.replaceNamespacedSecret({
      namespace: finalSecret.metadata!.namespace!,
      name: finalSecret.metadata!.name!,
      body: finalSecret,
    });
    // TODO history retention
  },
  install: async (chart: Array<Chart>, values: object, name: string, namespace: string) => {
    const results = await renderTemplate(chart, values, {
      Name: name,
      Namespace: namespace,
      Revision: 1,
      IsUpgrade: false,
      IsInstall: true,
    });
    console.log(results);
  }
};

const handlers = [
  handleFnCall(fns),
  handleDataResponse,
];

onmessage = async (e) => {
  for (const handler of handlers) {
    if (await handler(e)) {
      return;
    }
  }
  throw new Error(`unrecognized message ${JSON.stringify(e)}`);
}

export type OutboundMessage = FnCallOutboundMessage | RequestDataOutboundMessage;
export type InboundMessage = FnCallInboundMessage<typeof fns> | RequestDataInboundMessage;
