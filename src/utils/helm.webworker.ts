import {
  handleFnCall, progress,
  type FnCallInboundMessage, type FnCallOutboundMessage, type ToastMessage,
} from '@/utils/fnCall.webworker';
import {
  getBaseURL, getConfig, getGroups, getVersionInfo, handleDataResponse,
  type RequestDataInboundMessage, type RequestDataOutboundMessage,
} from '@/utils/requestData.webworker';
import {
  BatchV1Api, CoreV1Api, ApiextensionsV1Api,
  V1JobFromJSON, V1CustomResourceDefinitionFromJSON, V1PodFromJSON,
  type V1Secret, type V1CustomResourceDefinition, type VersionInfo,
} from '@xdavidwu/kubernetes-client-typescript-fetch';
import { parse, parseAllDocuments } from 'yaml';
import { AnyApi } from '@/utils/AnyApi';
import {
  errorIsResourceNotFound, errorIsAborted, errorIsAlreadyExists, rawErrorIsAborted,
  hasCondition, V1ConditionStatus, V1CustomResourceDefinitionConditionType, V1JobConditionType,
  V1PodStatusPhase, V1WatchEventType, V1DeletePropagation,
} from '@/utils/api';
import { fetchBase64Data, ignore } from '@/utils/lang';
import { PresentedError } from '@/utils/PresentedError';
import {
  secretName, releaseSecretType,
  type Chart, type File, type Hook, type Release, type SerializedChart, type SerializedFile,
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

declare function _helm_renderTemplate(
  charts: Array<string>, values: string, releaseOpts: string,
  capabilities: string, api: AnyApi,
): Promise<{ chart: string, files: { [key: string]: string }, crds: string }>;

// helm.sh/v3/pkg/chartutils.ReleaseOptions
interface ReleaseOptions {
  Name: string;
  Namespace: string;
  Revision: number;
  IsUpgrade: boolean;
  IsInstall: boolean;
}

// helm.sh/v3/pkg/chartutils.ReleaseOptions
// HelmVersion is filled in go
// Groups is our own raw data
interface Capabilities {
  KubeVersion: {
    Version: string;
    Major: string;
    Minor: string;
  };
  APIVersions: Array<string>;
  Groups: Array<V2APIGroupDiscovery>;
}

// helm.sh/v3/pkg/chart.CRD
interface CRD {
  Name: string;
  Filename: string;
  File: File;
}

interface SerializedCRD extends Omit<CRD, 'File'> {
  File: SerializedFile;
}

let goExitPromise: Promise<void> | undefined;

const setupGo = async () => {
  if (goExitPromise) {
    return;
  }
  progress('Initializing WebAssembly');
  const go = new Go();
  const __base_url = await getBaseURL();
  // polyfill for runtime rebasing for apiserver proxy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = { __base_url };
  const wasm = await helmWasmInit(go.importObject);
  goExitPromise = go.run(wasm);
};

const capabilitiesFromDiscovery = (versionInfo: VersionInfo, groups: Array<V2APIGroupDiscovery>): Capabilities => {
  const gvs = groups.flatMap((g) => g.versions.map((v) => ({
    gv: g.metadata?.name ? `${g.metadata.name}/${v.version}` : v.version,
    ks: v.resources.map((r) => r.responseKind.kind),
  })));
  const gvk = gvs.flatMap((v) => v.ks.map((k) => `${v.gv}/${k}`));
  return {
    KubeVersion: {
      Version: versionInfo.gitVersion,
      Major: versionInfo.major,
      Minor: versionInfo.minor,
    },
    APIVersions: gvs.map((v) => v.gv).concat(gvk),
    Groups: groups,
  };
};

const base64Buffer = (b: ArrayBuffer) =>
  btoa(Array.from(new Uint8Array(b), (b) => String.fromCodePoint(b)).join(''));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arrayBufferReplacer = (key: string, value: any): any =>
  value instanceof ArrayBuffer ? base64Buffer(value) : value;

const parseAnnotationList = <T extends string>(e: { [k: string]: T }, s?: string) =>
  s?.split(',').map((s) => s.trim().toLowerCase())
  .filter((v): v is T => Object.values(e).includes(v as T));

const renderTemplate = async (anyApi: AnyApi, groups: Array<V2APIGroupDiscovery>,
    chart: Array<Chart>, value: object, opts: ReleaseOptions) => {
  const result = await _helm_renderTemplate(
    chart.map((c) => JSON.stringify(c, arrayBufferReplacer)),
    JSON.stringify(value),
    JSON.stringify(opts),
    JSON.stringify(capabilitiesFromDiscovery(await getVersionInfo(), groups)),
    anyApi,
  );

  let notes = '';
  // helm seems to allow fooNOTES.txt?
  Object.keys(result.files).filter((f) => f.endsWith('NOTES.txt')).forEach((f) => {
    if (f == `${chart[0].metadata.name}/templates/NOTES.txt`) {
      notes = result.files[f];
    }
    // XXX do something with subnotes? but that's not helm default
    delete result.files[f];
  });

  const manifestsAndHooks = Object.entries(result.files).flatMap(([k, v]) =>
    parseAllDocuments(v).map((doc) => ({
      filename: k,
      resource: doc.toJS() as KubernetesObject,
      yaml: v.substring(doc.contents?.range[0] ?? 0, doc.contents?.range[1] ?? 0),
    })).filter((r) => r.resource),
  ).sort((a, b) => installOrderCompare(a.resource, b.resource));

  const hooks = manifestsAndHooks.filter((r) => r.resource.metadata!.annotations?.['helm.sh/hook'])
    .map((r): Hook => {
      const w = parseInt(r.resource.metadata!.annotations!['helm.sh/hook-weight']);
      return {
        name: r.resource.metadata!.name!,
        kind: r.resource.kind!,
        path: r.filename,
        manifest: r.yaml,
        events: parseAnnotationList<Event>(Event,
          r.resource.metadata!.annotations!['helm.sh/hook']),
        last_run: {
          started_at: '',
          completed_at: '',
          phase: Phase.UNKNOWN,
        },
        weight: isNaN(w) ? 0 : w,
        delete_policies: parseAnnotationList<DeletePolicy>(DeletePolicy,
          r.resource.metadata!.annotations!['helm.sh/hook-delete-policy']),
      };
    });
  const manifests = manifestsAndHooks.filter((r) => !(r.resource.metadata!.annotations?.['helm.sh/hook']));

  const serializedCRDs: Array<SerializedCRD> = JSON.parse(result.crds);
  const processedChart: SerializedChart = JSON.parse(result.chart);

  return {
    chart: processedChart,
    notes,
    resources: manifests.map((f) => f.resource),
    manifest: manifests.map((f) => `---\n# Source: ${f.filename}\n${f.yaml}\n`).join(''),
    hooks,
    crds: await Promise.all(serializedCRDs.map(async (c) => ({
      ...c,
      File: {
        name: c.File.name,
        data: await (await fetchBase64Data(c.File.data)).arrayBuffer(),
      },
    }))),
  };
};

// helm.sh/helm/v3/pkg/storage/driver.Secrets.newSecretsObject
const encodeSecret = async (r: Release): Promise<V1Secret> => {
  const bytes = new Blob([ JSON.stringify({ ...r, labels: undefined }) ]);
  const stream = bytes.stream().pipeThrough(new CompressionStream('gzip'));
  const gzipped = await (new Response(stream)).arrayBuffer();

  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: secretName(r),
      namespace: r.namespace,
      labels: {
        ...r.labels,
        name: r.name,
        owner: 'helm',
        status: r.info.status!,
        version: `${r.version}`,
      },
    },
    // helm gzip+base64 serialization + secret base64
    data: { release: btoa(base64Buffer(gzipped)) },
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
    extensionsApi: new ApiextensionsV1Api(config),
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

const parseManifest = <T = KubernetesObject>(manifest: string) =>
  parseAllDocuments(manifest).map((d): T | null => d.toJS()).filter((r): r is T => !!r);

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

// TODO move resolving out, handle unresolved
const applyDifference = async (anyApi: AnyApi, groups: Array<V2APIGroupDiscovery>,
    from: Array<KubernetesObject>, to: Array<KubernetesObject>) => {
  interface op {
    op: 'create' | 'replace' | 'delete';
    resource: KubernetesObject;
  }

  const createsAndUpdates = to.sort(installOrderCompare).map((r): op => ({
    op: from.some((t) => isSameKubernetesObject(r, t)) ? 'replace' : 'create',
    resource: r,
  }));
  const deletes = from.filter(
    (r) => !shouldKeepResource(r) && !to.some((t) => isSameKubernetesObject(r, t)),
  ).sort(uninstallOrderCompare).map((r): op => ({
    op: 'delete',
    resource: r,
  }));

  // create/update first, then delete
  await createsAndUpdates.concat(deletes).reduce(async (a, step) => {
    await a;

    const kindInfo = resolveObject(groups, step.resource)!;
    const common = {
      group: kindInfo.group,
      version: kindInfo.version,
      plural: kindInfo.resource,
      namespace: step.resource.metadata!.namespace!,
      name: step.resource.metadata!.name!,
    };
    if (step.op == 'replace') {
      try {
        const current = await anyApi[`get${kindInfo.scope}CustomObject`](common) as KubernetesObject;
        step.resource.metadata!.resourceVersion = current.metadata!.resourceVersion;
      } catch (e) {
        if (!await errorIsResourceNotFound(e)) {
          throw e;
        }
        step.op = 'create';
      }
    }

    if (step.op == 'delete') {
      // body has a different meaning on delete (V1DeleteOptions)
      await ignore(anyApi[`delete${kindInfo.scope}CustomObject`]({
        ...common,
        propagationPolicy: V1DeletePropagation.BACKGROUND,
      }), errorIsResourceNotFound);
    } else {
      await anyApi[`${step.op}${kindInfo.scope}CustomObject`]({
        ...common,
        fieldManager,
        body: step.resource,
      });
    }
  }, Promise.resolve());
};

const execHooks = (
  api: CoreV1Api, batchApi: BatchV1Api, anyApi: AnyApi,
  r: Release, ev: Event, groups: Array<V2APIGroupDiscovery>,
) => r.hooks?.filter((h) => h.events?.includes(ev))
  .sort((a, b) => a.weight - b.weight)
  .reduce(async (a, h) => {
    await a;

    const obj: KubernetesObject = parse(h.manifest);
    const kindInfo = resolveObject(groups, obj)!;
    const enforceDeletePolicy = async (p: DeletePolicy) => {
      // if empty, defaults to BEFORE_HOOK_CREATION
      if (!h.delete_policies?.includes(p) &&
          !(p == DeletePolicy.BEFORE_HOOK_CREATION && !h.delete_policies?.length)) {
        await ignore(anyApi[`delete${kindInfo.scope}CustomObject`]({
          group: kindInfo.group,
          version: kindInfo.version,
          plural: kindInfo.resource,
          namespace: obj.metadata!.namespace!,
          name: obj.metadata!.name!,
        }), errorIsResourceNotFound);
      }
    };

    await enforceDeletePolicy(DeletePolicy.BEFORE_HOOK_CREATION);

    h.last_run = {
      started_at: (new Date()).toISOString(),
      phase: Phase.RUNNING,
      completed_at: '',
    };
    await updateRelease(api, r);

    try {
      await anyApi[`create${kindInfo.scope}CustomObject`]({
        group: kindInfo.group,
        version: kindInfo.version,
        plural: kindInfo.resource,
        namespace: obj.metadata!.namespace!,
        body: obj,
        fieldManager,
      });

      const abortController = new AbortController();
      // helm defaults to 5m
      const t = setTimeout(() => abortController.abort(), 5 * 60 * 1000);
      if (obj.apiVersion == 'batch/v1' && obj.kind == 'Job') {
        await watchUntil(
          (opt) => batchApi.listNamespacedJobRaw({
            namespace: obj.metadata!.namespace!,
            fieldSelector: `metadata.name=${obj.metadata!.name}`,
            ...opt,
          }, { signal: abortController.signal }),
          V1JobFromJSON,
          (ev) => {
            if (ev.type == V1WatchEventType.ADDED || ev.type == V1WatchEventType.MODIFIED) {
              if (hasCondition(ev.object, V1JobConditionType.COMPLETE, V1ConditionStatus.TRUE)) {
                return true;
              }
              if (hasCondition(ev.object, V1JobConditionType.FAILED, V1ConditionStatus.TRUE)) {
                throw new PresentedError(`Failed to exec hook: Job ${obj.metadata!.name} failed`);
              }
              return false;
            } else if (ev.type == V1WatchEventType.DELETED) {
              // throw new PresentedError(`Failed to exec hook: Job ${obj.metadata!.name} deleted while waiting for completion`);
              return true; // helm seems to treat as a success?
            }
            return false;
          },
        )
      } else if (obj.apiVersion == 'v1' && obj.kind == 'Pod') {
        await watchUntil(
          (opt) => api.listNamespacedPodRaw({
            namespace: obj.metadata!.namespace!,
            fieldSelector: `metadata.name=${obj.metadata!.name}`,
            ...opt,
          }, { signal: abortController.signal }),
          V1PodFromJSON,
          (ev) => {
            if (ev.type == V1WatchEventType.ADDED || ev.type == V1WatchEventType.MODIFIED) {
              switch (ev.object.status?.phase) {
              case V1PodStatusPhase.SUCCEEDED:
                return true;
              case V1PodStatusPhase.FAILED:
                throw new PresentedError(`Failed to exec hook: Pod ${obj.metadata!.name} failed`);
              default:
                return false;
              }
            } else if (ev.type == V1WatchEventType.DELETED) {
              // throw new PresentedError(`Failed to exec hook: Pod ${obj.metadata!.name} deleted while waiting for completion`);
              return true; // helm seems to treat as a success?
            }
            return false;
          },
        )
      }
      clearTimeout(t);

      h.last_run.phase = Phase.SUCCEEDED;
      h.last_run.completed_at = (new Date()).toISOString();

      await enforceDeletePolicy(DeletePolicy.SUCCEEDED);
    } catch (_e) {
      let e = _e;
      h.last_run.phase = Phase.FAILED;
      h.last_run.completed_at = (new Date()).toISOString();

      if (errorIsAborted(e) || rawErrorIsAborted(e)) {
        e = new PresentedError(`Timeout waiting for hook ${h.kind} ${h.name}`);
      }

      await enforceDeletePolicy(DeletePolicy.FAILED);

      throw e;
    }
    await updateRelease(api, r);
  }, Promise.resolve());

const fns = {
  // helm.sh/helm/v3/pkg/action.Uninstall.Run
  uninstall: async (release: Release) => {
    const { api, batchApi, anyApi } = await setupClients();
    const groups = await getGroups();

    progress(`Running ${Event.PRE_DELETE} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.PRE_DELETE, groups);

    progress('Parsing resources to delete');

    const resources = parseManifest(release.manifest)
      .filter((r) => !shouldKeepResource(r)).sort(uninstallOrderCompare);

    progress('Marking release as uninstalling');

    release.info.status = Status.UNINSTALLING;
    release.info.deleted = (new Date()).toISOString();
    release.info.description = 'Deletion in progress (or sliently failed)';
    await updateRelease(api, release);

    progress('Deleting resources');

    await applyDifference(anyApi, groups, resources, []);

    // TODO wait?

    progress(`Running ${Event.POST_DELETE} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.POST_DELETE, groups);

    progress('Marking release as uninstalled');

    release.info.status = Status.UNINSTALLED;
    release.info.description = 'Uninstallation complete';
    await updateRelease(api, release);
  },
  // helm.sh/helm/v3/pkg/action.Rollback.Run
  // expect lastest state at first of history (reverse time order)
  rollback: async (release: Release, history: Array<Release>) => {
    const { api, batchApi, anyApi } = await setupClients();
    const groups = await getGroups();

    progress('Creating new release');

    const latest = history[0];

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

    progress(`Running ${Event.PRE_ROLLBACK} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.PRE_ROLLBACK, groups);

    progress('Rolling back resources')

    const resources = parseManifest(release.manifest).map((r) => addManagedMetadata(r, release));
    const latestResources = parseManifest(latest.manifest);

    await applyDifference(anyApi, groups, latestResources, resources);

    // TODO recreate? (delete old pod to trigger a rollout?), wait?

    progress(`Running ${Event.POST_ROLLBACK} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.POST_ROLLBACK, groups);

    progress('Marking release statuses');

    await Promise.all(history.filter((r) => r.info.status == Status.DEPLOYED)
      .map(async (r) => {
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
    const { api, batchApi, extensionsApi, anyApi } = await setupClients();
    const groups = await getGroups();

    progress('Rendering resource templates');

    const {
      notes,
      resources,
      hooks,
      manifest,
      chart: processedChart,
      crds,
    } = await renderTemplate(anyApi, groups, chart, values, {
      Name: name,
      Namespace: namespace,
      Revision: 1,
      IsUpgrade: false,
      IsInstall: true,
    });

    // before discovery via getGroups
    progress('Installing CRDs');

    const decoder = new TextDecoder();
    const defs = crds.flatMap((v) =>
      parseManifest<V1CustomResourceDefinition>(decoder.decode(v.File.data)));

    defs.forEach((d) => {
      if (d.apiVersion != 'apiextensions.k8s.io/v1' || d.kind != 'CustomResourceDefinition') {
        throw new Error(`Unsupported object on crd: ${d.apiVersion}.${d.kind} ${d.metadata?.name}`);
      }
    });

    await Promise.all(defs.map(async (d) => {
      await ignore(extensionsApi.createCustomResourceDefinition({
        body: d,
        fieldManager,
      }), errorIsAlreadyExists);
      await watchUntil(
        (opt) => extensionsApi.listCustomResourceDefinitionRaw({
          fieldSelector: `metadata.name=${d.metadata!.name}`,
          ...opt,
        }),
        V1CustomResourceDefinitionFromJSON,
        (ev) => {
          if (ev.type == V1WatchEventType.ADDED || ev.type == V1WatchEventType.MODIFIED) {
            if (hasCondition(ev.object, V1CustomResourceDefinitionConditionType.ESTABLISHED, V1ConditionStatus.TRUE)) {
              return true;
            }
            if (hasCondition(ev.object, V1CustomResourceDefinitionConditionType.NAMES_ACCEPTED, V1ConditionStatus.FALSE)) {
              // a conflict, server already accepts it but with other defs
              const msg: ToastMessage = {
                type: 'toast',
                message: `CRD ${d.metadata!.name} result in a name conflict with existing definition\nThe release may not work as intended`,
              };
              postMessage(msg);
              return true;
            }
            return false;
          } else if (ev.type == V1WatchEventType.DELETED) {
            throw new Error(`CRD ${d.metadata!.name} deleted while waiting`);
          }
          return false;
        },
      );
    }));

    progress('Checking resource conflicts');

    const resolved = resources.map((r) => ({ r, kindInfo: resolveObject(groups, r)! }));

    // XXX helm allows adoption if managed, but this is for installing a new release?
    await Promise.all(resolved.map(async (r) => {
      try {
        await anyApi[`get${r.kindInfo.scope}CustomObject`]({
          group: r.kindInfo.group,
          version: r.kindInfo.version,
          plural: r.kindInfo.resource,
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
        notes,
      },
      chart: processedChart,
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

    await applyDifference(anyApi, groups, [], resources.map((r) => addManagedMetadata(r, release)));

    progress(`Running ${Event.POST_INSTALL} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.POST_INSTALL, groups);

    progress('Marking release status');

    release.info.status = Status.DEPLOYED;
    release.info.description = 'Install complete';
    await updateRelease(api, release);

    return secretName(release);
  },
  upgrade: async (chart: Array<Chart>, values: object, oldRelease: Release, history: Array<Release>) => {
    await setupGo();
    const { api, batchApi, anyApi } = await setupClients();
    const groups = await getGroups();

    progress('Rendering resource templates');

    const version = history[0].version + 1;
    const {
      notes,
      resources,
      hooks,
      manifest,
      chart: processedChart,
    } = await renderTemplate(anyApi, groups, chart, values, {
      Name: oldRelease.name,
      Namespace: oldRelease.namespace,
      Revision: version,
      IsUpgrade: false,
      IsInstall: true,
    });

    progress('Creating release');

    const release: Release = {
      name: oldRelease.name,
      info: {
        first_deployed: oldRelease.info.first_deployed,
        last_deployed: (new Date()).toISOString(),
        status: Status.PENDING_UPGRADE,
        description: 'Preparing upgrade',
        deleted: '',
        notes,
      },
      chart: processedChart,
      config: values,
      manifest,
      hooks,
      version,
      namespace: oldRelease.namespace,
      labels: {},
    };
    await createRelease(api, release);

    progress(`Running ${Event.PRE_UPGRADE} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.PRE_UPGRADE, groups);

    progress('Upgrading resources')

    const onlineResources = parseManifest(oldRelease.manifest);

    await applyDifference(anyApi, groups, onlineResources, resources.map((r) => addManagedMetadata(r, release)));

    // TODO recreate? (delete old pod to trigger a rollout?), wait?

    progress(`Running ${Event.POST_UPGRADE} hooks`);

    await execHooks(api, batchApi, anyApi, release, Event.POST_UPGRADE, groups);

    progress('Marking release statuses');

    await Promise.all(history.filter((r) => r.info.status == Status.DEPLOYED)
      .map(async (r) => {
        r.info.status = Status.SUPERSEDED;
        await updateRelease(api, r);
      }));

    release.info.status = Status.DEPLOYED;
    await updateRelease(api, release);

    return secretName(release);
  },
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
};

export type OutboundMessage = FnCallOutboundMessage | RequestDataOutboundMessage;
export type InboundMessage = FnCallInboundMessage<typeof fns> | RequestDataInboundMessage;
