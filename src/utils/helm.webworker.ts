import {
  handleFnCall, progress,
  type FnCallInboundMessage, type FnCallOutboundMessage,
} from '@/utils/fnCall.webworker';
import {
  getConfig, getGroups, getVersionInfo, handleDataResponse,
  type RequestDataInboundMessage, type RequestDataOutboundMessage,
} from '@/utils/requestData.webworker';
import {
  BatchV1Api, CoreV1Api,
  V1JobFromJSON, V1PodFromJSON,
  type V1Secret, type VersionInfo,
} from '@/kubernetes-api/src';
import { AnyApi } from '@/utils/AnyApi';
import { errorIsResourceNotFound } from '@/utils/api';
import { PresentedError } from '@/utils/PresentedError';
import { parse, parseAllDocuments } from 'yaml';
import { stringify } from '@/utils/yaml';
import {
  type Chart, type Hook, type Release, type SerializedChart,
  DeletePolicy, Event, Phase, Status,
} from '@/utils/helm';
import { type V2APIGroupDiscovery, resolveObject } from '@/utils/discoveryV2';
import { isSameKubernetesObject, type KubernetesObject } from '@/utils/objects';
import { watchUntil } from '@/utils/watch';
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
  const result = await _helm_renderTemplate(
    chart.map((c) => JSON.stringify(c, arrayBufferReplacer)),
    JSON.stringify(value),
    JSON.stringify(opts),
    JSON.stringify(capabilitiesFromDiscovery(await getVersionInfo(), await getGroups())),
    new AnyApi(await getConfig()),
  );
  return result;
};

const toSerializedChart = (chart: Chart): SerializedChart =>
  JSON.parse(JSON.stringify(chart, arrayBufferReplacer));

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

// helm.sh/v3/pkg/releaseutil.UninstallOrder
const uninstallOrder = [
  "APIService",
  "Ingress",
  "IngressClass",
  "Service",
  "CronJob",
  "Job",
  "StatefulSet",
  "HorizontalPodAutoscaler",
  "Deployment",
  "ReplicaSet",
  "ReplicationController",
  "Pod",
  "DaemonSet",
  "RoleBindingList",
  "RoleBinding",
  "RoleList",
  "Role",
  "ClusterRoleBindingList",
  "ClusterRoleBinding",
  "ClusterRoleList",
  "ClusterRole",
  "CustomResourceDefinition",
  "PersistentVolumeClaim",
  "PersistentVolume",
  "StorageClass",
  "ConfigMap",
  "SecretList",
  "Secret",
  "ServiceAccount",
  "PodDisruptionBudget",
  "PodSecurityPolicy",
  "LimitRange",
  "ResourceQuota",
  "NetworkPolicy",
  "Namespace",
  "PriorityClass",
];

// helm.sh/v3/pkg/releaseutil.InstallOrder
// NOT a reverse of uninstallOrder
const installOrder = [
  "PriorityClass",
  "Namespace",
  "NetworkPolicy",
  "ResourceQuota",
  "LimitRange",
  "PodSecurityPolicy",
  "PodDisruptionBudget",
  "ServiceAccount",
  "Secret",
  "SecretList",
  "ConfigMap",
  "StorageClass",
  "PersistentVolume",
  "PersistentVolumeClaim",
  "CustomResourceDefinition",
  "ClusterRole",
  "ClusterRoleList",
  "ClusterRoleBinding",
  "ClusterRoleBindingList",
  "Role",
  "RoleList",
  "RoleBinding",
  "RoleBindingList",
  "Service",
  "DaemonSet",
  "Pod",
  "ReplicationController",
  "ReplicaSet",
  "Deployment",
  "HorizontalPodAutoscaler",
  "StatefulSet",
  "Job",
  "CronJob",
  "IngressClass",
  "Ingress",
  "APIService",
];

// helm.sh/v3/pkg/releaseutil.lessByKind
// reversed for Array.prototype.sort
const orderCompare = (order: Array<string>) => (a: KubernetesObject, b: KubernetesObject) => {
  const akind = a.kind ?? '';
  const bkind = b.kind ?? '';
  const ai = order.indexOf(akind);
  const bi = order.indexOf(bkind);
  if (ai == -1 && bi == -1) {
    return akind.localeCompare(bkind);
  }
  if (ai == -1) {
    return 1;
  }
  if (bi == -1) {
    return -1;
  }
  return ai - bi;
};

const uninstallOrderCompare = orderCompare(uninstallOrder);
const installOrderCompare = orderCompare(installOrder);

const setupClients = async () => {
  const config = await getConfig();
  return {
    api: new CoreV1Api(config),
    batchApi: new BatchV1Api(config),
    anyApi: new AnyApi(config),
  };
};

const updateRelease = async (api: CoreV1Api, release: Release) => {
  const secret = await encodeSecret(release);
  await api.replaceNamespacedSecret({
    namespace: secret.metadata!.namespace!,
    name: secret.metadata!.name!,
    body: secret,
  });
};

const createRelease = async (api: CoreV1Api, release: Release) => {
  const secret = await encodeSecret(release);
  await api.createNamespacedSecret({
    namespace: secret.metadata!.namespace!,
    body: secret,
  });
};

const parseManifests = (manifest: string) =>
  parseAllDocuments(manifest).map((d) => d.toJS() as KubernetesObject);

const addManagedMetadata = (resource: KubernetesObject, release: Release): KubernetesObject => ({
  ...resource,
  metadata: {
    ...resource.metadata,
    annotations: {
      ...resource.metadata!.annotations,
      'meta.helm.sh/release-name': release.name,
      'meta.helm.sh/release-namespace': release.namespace,
    },
    labels: {
      ...resource.metadata!.labels,
      'app.kubernetes.io/managed-by': 'Helm',
    },
  },
});

// TODO hook deletion, timeouts
const execHooks = async (
  api: CoreV1Api, batchApi: BatchV1Api, anyApi: AnyApi,
  r: Release, ev: Event, groups: Array<V2APIGroupDiscovery>,
) => {
  if (!r.hooks) {
    return;
  }
  await r.hooks.filter((h) => h.events?.includes(ev))
    .sort((a, b) => a.weight - b.weight)
    .reduce(async (a, h) => {
      await a;
      const obj: KubernetesObject = parse(h.manifest);
      h.last_run = {
        started_at: (new Date()).toISOString(),
        phase: Phase.RUNNING,
        completed_at: '',
      };
      await updateRelease(api, r);
      try {
        if (obj.apiVersion == 'batch/v1' && obj.kind == 'Job') {
          await batchApi.createNamespacedJob({
            namespace: obj.metadata!.namespace!,
            body: obj,
            fieldManager,
          });
          await watchUntil(
            (opt) => batchApi.listNamespacedJobRaw({
              namespace: obj.metadata!.namespace!,
              fieldSelector: `metadata.name=${obj.metadata!.name}`,
              ...opt,
            }),
            V1JobFromJSON,
            (ev) => {
              if (ev.type == 'ADDED' || ev.type == 'MODIFIED') {
                if (ev.object.status?.conditions?.some((c) => c.type == 'Complete' && c.status == 'True')) {
                  return true;
                }
                if (ev.object.status?.conditions?.some((c) => c.type == 'Failed' && c.status == 'True')) {
                  throw new PresentedError(`Failed to exec hook: Job ${obj.metadata!.name} failed`);
                }
                return false;
              } else if (ev.type == 'DELETED') {
                // throw new PresentedError(`Failed to exec hook: Job ${obj.metadata!.name} deleted while waiting for completion`);
                return true; // helm seems to treat as a success?
              }
              return false;
            },
          )
        } else if (obj.apiVersion == 'v1' && obj.kind == 'Pod') {
          await api.createNamespacedPod({
            namespace: obj.metadata!.namespace!,
            body: obj,
            fieldManager,
          });
          await watchUntil(
            (opt) => api.listNamespacedPodRaw({
              namespace: obj.metadata!.namespace!,
              fieldSelector: `metadata.name=${obj.metadata!.name}`,
              ...opt,
            }),
            V1PodFromJSON,
            (ev) => {
              if (ev.type == 'ADDED' || ev.type == 'MODIFIED') {
                switch (ev.object.status?.phase) {
                case 'Succeeded':
                  return true;
                case 'Failed':
                  throw new PresentedError(`Failed to exec hook: Pod ${obj.metadata!.name} failed`);
                default:
                  return false;

                }
              } else if (ev.type == 'DELETED') {
                // throw new PresentedError(`Failed to exec hook: Pod ${obj.metadata!.name} deleted while waiting for completion`);
                return true; // helm seems to treat as a success?
              }
              return false;
            },
          )
        } else {
          const info = resolveObject(groups, obj);
          await anyApi[`create${info.scope!}CustomObject`]({
            group: info.group,
            version: info.version,
            plural: info.resource!,
            namespace: obj.metadata!.namespace!,
            body: obj,
            fieldManager,
          });
        }
        h.last_run.phase = Phase.SUCCEEDED;
        h.last_run.completed_at = (new Date()).toISOString();
      } catch (e) {
        h.last_run.phase = Phase.FAILED;
        h.last_run.completed_at = (new Date()).toISOString();
        throw e;
      }
      await updateRelease(api, r);
    }, (async () => {})());
};

const fns = {
  // helm.sh/helm/v3/pkg/action.Uninstall.Run
  // TODO align namings
  uninstall: async (target: Release) => {
    progress(`Running ${Event.PRE_DELETE} hooks`);

    const { api, batchApi, anyApi } = await setupClients();
    const groups = await getGroups();

    await execHooks(api, batchApi, anyApi, target, Event.PRE_DELETE, groups);

    progress('Parsing resources to delete');

    const targetResources = parseManifests(target.manifest);
    const toDelete = targetResources.filter((r) => !shouldKeepResource(r)).sort(uninstallOrderCompare);

    progress('Marking release as uninstalling');

    target.info.status = Status.UNINSTALLING;
    target.info.deleted = (new Date()).toISOString();
    target.info.description = 'Deletion in progress (or sliently failed)';
    await updateRelease(api, target);

    progress('Deleting resources');

    await toDelete.reduce(async (a, v) => {
      await a;
      const info = resolveObject(groups, v);
      await anyApi[`delete${info.scope!}CustomObject`]({
        group: info.group,
        version: info.version,
        plural: info.resource!,
        namespace: v.metadata!.namespace!,
        name: v.metadata!.name!,
      });
    }, (async () => {})());

    // TODO perhaps tell user what are kept
    // TODO wait?

    progress(`Running ${Event.POST_DELETE} hooks`);

    await execHooks(api, batchApi, anyApi, target, Event.POST_DELETE, groups);

    progress('Marking release as uninstalled');

    target.info.status = Status.UNINSTALLED;
    target.info.description = 'Uninstallation complete';
    await updateRelease(api, target);
  },
  // helm.sh/helm/v3/pkg/action.Rollback.Run
  rollback: async (target: Release, releases: Array<Release>) => {
    progress('Creating new release');

    const { api, batchApi, anyApi } = await setupClients();

    const latest = releases.filter((r) => r.name == target.name)[0];

    const release = structuredClone(target);
    release.info = {
      first_deployed: latest.info.first_deployed,
      last_deployed: (new Date()).toISOString(),
      status: Status.PENDING_ROLLBACK,
      notes: release.info.notes,
      description: `Rollback to ${release.version}`,
      deleted: '',
    };
    release.version = latest.version + 1;

    await createRelease(api, release);

    progress('Calculating rollback difference')

    const targetResources = parseManifests(release.manifest);
    const latestResources = parseManifests(latest.manifest);

    const createsAndUpdates = targetResources.map((r) => ({
      type: latestResources.some((t) => isSameKubernetesObject(r, t)) ? 'replace' : 'create',
      target: addManagedMetadata(r, release),
    }));
    const deletes = latestResources.filter(
      (r) => !targetResources.some((t) => isSameKubernetesObject(r, t)) && !shouldKeepResource(r),
    // helm does not seems to care about ordering here, but probably should
    ).sort(uninstallOrderCompare).map((r) => ({
      type: 'delete',
      target: r,
    }));

    const groups = await getGroups();
    // create/update first, then delete
    // manifests are already sorted in installation order
    const ops = createsAndUpdates.concat(deletes).map((op) => ({
      type: op.type as 'create' | 'replace' | 'delete',
      target: op.target,
      kindInfo: resolveObject(groups, op.target),
    }));

    progress(`Running ${Event.PRE_ROLLBACK} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.PRE_ROLLBACK, groups);

    progress('Applying rollback');

    await ops.reduce(async (a, op) => {
      const act = (verb: 'create' | 'replace' | 'delete') =>
        anyApi[`${verb}${op.kindInfo.scope!}CustomObject`]({
          group: op.kindInfo.group,
          version: op.kindInfo.version,
          plural: op.kindInfo.resource!,
          namespace: op.target.metadata!.namespace!,
          name: op.target.metadata!.name!,
          body: op.target,
          fieldManager,
        });
      await a;
      try {
        await act(op.type);
      } catch (e) {
        // some (apps/v1 Deployment) does not treat PUT without existing resource as create, but the others does
        if (op.type == 'replace' && await errorIsResourceNotFound(e)) {
          await act('create');
          return;
        }
        throw e;
      }
    }, (async () => {})());
    // TODO error handling, undo on failure?

    // TODO recreate? (delete old pod to trigger a rollout?), wait?

    progress(`Running ${Event.POST_ROLLBACK} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.POST_ROLLBACK, groups);

    progress('Marking release statuses');

    await Promise.all(releases.filter(
      (r) => r.name == target.name && r.info.status == Status.DEPLOYED,
    ).map(async (r) => {
      r.info.status = Status.SUPERSEDED;
      await updateRelease(api, r);
    }));

    release.info.status = Status.DEPLOYED;
    await updateRelease(api, release);
    // TODO history retention
  },
  // helm.sh/helm/v3/pkg/action.Install.RunWithContext
  install: async (chart: Array<Chart>, values: object, name: string, namespace: string) => {
    await setupGo();

    const { api, batchApi, anyApi } = await setupClients();

    // TODO support crds

    progress('Rendering resource templates');

    const results = await renderTemplate(chart, values, {
      Name: name,
      Namespace: namespace,
      Revision: 1,
      IsUpgrade: false,
      IsInstall: true,
    });

    let notes = '';

    // helm seems to allow fooNOTES.txt?
    Object.keys(results).filter((f) => f.endsWith('NOTES.txt')).forEach((f) => {
      if (f == `${chart[0].metadata.name}/templates/NOTES.txt`) {
        notes = results[f];
      }
      // XXX do something with subnotes? but that's not helm default
      delete results[f];
    });
    // TODO make it proper
    console.log(notes);

    const files = Object.entries(results).map(([k, v]) =>
      parseManifests(v).filter((r) => r).map((r) => ({ filename: k, resource: r })),
    ).reduce((a, v) => a.concat(v), []).sort((a, b) => installOrderCompare(a.resource, b.resource));

    const hooks = files.filter((r) => r.resource.metadata!.annotations?.['helm.sh/hook']).map((r): Hook => {
      const w = parseInt(r.resource.metadata!.annotations!['helm.sh/hook-weight']);
      return {
        name: r.resource.metadata!.name!,
        kind: r.resource.kind!,
        path: r.filename,
        // XXX cut from original doc?
        manifest: stringify(r.resource),
        events: r.resource.metadata!.annotations!['helm.sh/hook'].split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((h): h is Event => Object.values(Event).includes(h as Event)),
        last_run: {
          started_at: '',
          completed_at: '',
          phase: Phase.UNKNOWN,
        },
        weight: isNaN(w) ? 0 : w,
        delete_policies: r.resource.metadata!.annotations!['helm.sh/hook-delete-policy']?.split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((h): h is DeletePolicy => Object.values(DeletePolicy).includes(h as DeletePolicy)),
      };
    });
    const manifests = files.filter((r) => !(r.resource.metadata!.annotations?.['helm.sh/hook']));

    const manifest = manifests.map((f) =>
      // XXX cut from original doc?
      `---\n# Source: ${f.filename}\n${stringify(f.resource)}\n`).join('');

    const resources = manifests.map((f) => f.resource);

    progress('Checking resource conflicts');

    const groups = await getGroups();

    const resolved = resources.map((r) => ({ r, kindInfo: resolveObject(groups, r) }));

    // XXX helm allows adoption if managed, but this is for installing a new release?
    await Promise.all(resolved.map(async (r) => {
      try {
        await anyApi[`get${r.kindInfo.scope!}CustomObject`]({
          group: r.kindInfo.group!,
          version: r.kindInfo.version!,
          plural: r.kindInfo.resource!,
          namespace: r.r.metadata!.namespace!,
          name: r.r.metadata!.name!,
        });
      } catch (e) {
        if (await errorIsResourceNotFound(e)) {
          return;
        }
        throw e;
      }
      const groupVersion = r.kindInfo.group ? `${r.kindInfo.group}/${r.kindInfo.version}` : r.kindInfo.version;
      throw new PresentedError(`Cannot install Helm release ${name}:\nResource conflict: ${groupVersion} ${r.kindInfo.responseKind!.kind} ${r.r.metadata!.name} already exists`);
    }));

    progress('Creating release');

    const release: Release = {
      name,
      info: {
        first_deployed: (new Date()).toISOString(),
        last_deployed: (new Date()).toISOString(),
        status: Status.PENDING_INSTALL,
        description: 'Initial install underway',
        deleted: '',
      },
      chart: toSerializedChart(chart[0]),
      config: values,
      manifest,
      hooks,
      version: 1,
      namespace,
      labels: {},
    };

    await createRelease(api, release);

    progress(`Running ${Event.PRE_INSTALL} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.PRE_INSTALL, groups);

    progress('Creating resources');

    await resolved.map((v) => ({
      r: addManagedMetadata(v.r, release),
      kindInfo: v.kindInfo,
    })).reduce(async (a, r) => {
      await a;
      await anyApi[`create${r.kindInfo.scope!}CustomObject`]({
        group: r.kindInfo.group!,
        version: r.kindInfo.version!,
        plural: r.kindInfo.resource!,
        namespace: r.r.metadata!.namespace!,
        body: r.r,
        fieldManager,
      });
    }, (async () => {})());

    progress(`Running ${Event.POST_INSTALL} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.POST_INSTALL, groups);

    progress('Marking release status');

    release.info.status = Status.DEPLOYED;
    release.info.description = 'Install complete';
    await updateRelease(api, release);
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
