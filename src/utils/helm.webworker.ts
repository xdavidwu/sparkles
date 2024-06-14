import {
  handleFnCall, progress,
  type FnCallInboundMessage, type FnCallOutboundMessage,
} from '@/utils/fnCall.webworker';
import {
  getConfig, getGroups, handleDataResponse,
  type RequestDataInboundMessage, type RequestDataOutboundMessage,
} from '@/utils/requestData.webworker';
import { CoreV1Api, type V1Secret } from '@/kubernetes-api/src';
import { AnyApi } from '@/utils/AnyApi';
import { parseAllDocuments } from 'yaml';
import { type Release, Status } from '@/utils/helm';
import { resolveObject } from '@/utils/discoveryV2';
import type { KubernetesObject } from '@/utils/objects';

const releaseSecretType = 'helm.sh/release.v1';

// helm.sh/helm/v3/pkg/storage/driver.Secrets.newSecretsObject
const encodeSecret = async (r: Release): Promise<V1Secret> => {
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

    const targetResources = parseAllDocuments(target.manifest).map((d) => d.toJS() as KubernetesObject);
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
    // TODO do we want to impl hard delete (remove history)?

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
