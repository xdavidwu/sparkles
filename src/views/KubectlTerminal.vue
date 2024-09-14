<script setup lang="ts">
import { VBtn, VCard, VDialog } from 'vuetify/components';
import ExecTerminal from '@/components/ExecTerminal.vue';
import ProgressDialog from '@/components/ProgressDialog.vue';
import { ref, watch, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useEventListener } from '@vueuse/core';
import { useApiConfig } from '@/stores/apiConfig';
import { useNamespaces } from '@/stores/namespaces';
import {
  descriptionAnnotaion, errorIsResourceNotFound, fromYAMLSSA,
  V1WatchEventType,
} from '@/utils/api';
import { brand } from '@/utils/config';
import { managedByLabel } from '@/utils/contracts';
import { watchUntil } from '@/utils/watch';
import { PresentedError } from '@/utils/PresentedError';
import {
  CoreV1Api, RbacAuthorizationV1Api,
  type V1Pod, type V1ServiceAccount, type V1RoleBinding,
  V1PodFromJSON,
} from '@xdavidwu/kubernetes-client-typescript-fetch';

const config = await useApiConfig().getConfig();
const api = new CoreV1Api(config);
const rbacApi = new RbacAuthorizationV1Api(config);
const { selectedNamespace } = storeToRefs(useNamespaces());

enum State {
  ASK_FOR_CREATING,
  CREATING,
  READY,
  USER_CANCELED,
}

const state = ref(State.ASK_FOR_CREATING);
const podName = ref('');
const progressMessage = ref('');
const progressing = ref(false);

const name = 'sparkles-kubectl-shell';
const SUPPORTING_POD_PREFIX = `${name}-`;
const SUPPORTING_CONTAINER_NAME = 'kubectl';
const SUPPORTING_SERVICEACCOUNT_NAME = name;
const SUPPORTING_ROLEBINDING_NAME = name;

const load = async () => {
  podName.value = '';
  state.value = State.ASK_FOR_CREATING;
};

const cancelCreate = () => {
  state.value = State.USER_CANCELED;
};

const encodeBlob = (o: object) => new Blob([JSON.stringify(o)]);
const create = async () => {
  state.value = State.CREATING;
  progressMessage.value = 'Creating supporting pod';
  progressing.value = true;

  const serviceAccount: V1ServiceAccount = {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: SUPPORTING_SERVICEACCOUNT_NAME,
      labels: managedByLabel,
      annotations: {
        [descriptionAnnotaion]: `Used for kubectl shell functionality in ${brand}.`,
      },
    },
  };
  const roleBinding: V1RoleBinding = {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
      name: SUPPORTING_ROLEBINDING_NAME,
      labels: managedByLabel,
      annotations: {
        [descriptionAnnotaion]: `Used for kubectl shell functionality in ${brand}.`,
      },
    },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'admin', // TODO can we somehow copy what user has?
    },
    subjects: [{
      kind: 'ServiceAccount',
      namespace: selectedNamespace.value,
      name: SUPPORTING_SERVICEACCOUNT_NAME,
    }],
  };
  const pod: V1Pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      generateName: SUPPORTING_POD_PREFIX,
      labels: managedByLabel,
      annotations: {
        [descriptionAnnotaion]: `Pod that implements kubectl shell funtionality in ${brand}. ` +
          'A pod is used per kubectl shell session, with ServiceAccount of admin role under the same namespace. ' +
          'Will be deleted automatically when user exit the session, ' +
          'but may still be left running if the browser crashes. ' +
          'In that case, you can delete this manually.',
      },
    },
    spec: {
      containers: [{
        name: SUPPORTING_CONTAINER_NAME,
        // TODO find a better one with completion, helm, match version with cluster
        image: 'bitnami/kubectl',
        // fork and wait to get rid of pid 1 signal quirks
        command: ['/bin/sh', '-c'],
        args: ['sleep infinity; true'],
        securityContext: {
          allowPrivilegeEscalation: false,
          capabilities: {
            drop: ['ALL'],
          },
          runAsNonRoot: true,
          seccompProfile: {
            type: 'RuntimeDefault',
          },
        },
      }],
      serviceAccountName: SUPPORTING_SERVICEACCOUNT_NAME,
      restartPolicy: 'Never',
    },
  };

  await api.patchNamespacedServiceAccount({
    namespace: selectedNamespace.value,
    name: SUPPORTING_SERVICEACCOUNT_NAME,
    force: true,
    body: encodeBlob(serviceAccount),
  }, fromYAMLSSA);

  await Promise.all([
    api.createNamespacedPod({
      namespace: selectedNamespace.value,
      body: pod,
    }).then((pod) => podName.value = pod.metadata!.name!),
    rbacApi.patchNamespacedRoleBinding({
      namespace: selectedNamespace.value,
      name: SUPPORTING_ROLEBINDING_NAME,
      force: true,
      body: encodeBlob(roleBinding),
    }, fromYAMLSSA),
  ]);

  await waitForReady();
};

const waitForReady = async () => {
  progressMessage.value = 'Waiting for supporting pod to become ready';
  progressing.value = true;
  // TODO timeout?
  await watchUntil(
    (opt) => api.listNamespacedPodRaw({
      namespace: selectedNamespace.value,
      fieldSelector: `metadata.name=${podName.value}`,
      ...opt
    }),
    V1PodFromJSON,
    (ev) => {
      if (ev.type === V1WatchEventType.ADDED ||
          ev.type === V1WatchEventType.MODIFIED) {
        return ev.object.status?.containerStatuses?.find(
          (s) => s.name === SUPPORTING_CONTAINER_NAME)?.ready ?? false;
      } else if (ev.type === V1WatchEventType.DELETED) {
        throw new PresentedError('Supporting pod deleted on cluster');
      }
      return false;
    }
  );
  progressing.value = false;
  state.value = State.READY;
};

await load();

const cleanup = async (namespace: string) => {
  if (!podName.value) {
    return;
  }

  try {
    await api.deleteNamespacedPod({ namespace, name: podName.value });
  } catch (e) {
    if (!await errorIsResourceNotFound(e)) {
      throw e;
    }
  }
};

watch(selectedNamespace, (to: string, from: string) => Promise.all([
  load,
  cleanup(from),
]));

onUnmounted(() => cleanup(selectedNamespace.value));

useEventListener(window, 'beforeunload', () => {
  cleanup(selectedNamespace.value);
});
</script>

<template>
  <div>
    <VDialog :model-value="state === State.ASK_FOR_CREATING" persistent width="auto">
      <VCard title="Using kubectl shell">
        <template #text>
          A supporting pod is required for each kubectl shell session.
          <br />
          <br />
          This will create a supporting pod with privilege as admin role in this namespace,
          <br />
          be careful if you have previously set up roles allowing others to execute commands in pods.
          <br />
          Quota restriction, if any, may applies.
          <br />
          <br />
          Proceed to create one?
        </template>
        <template #actions>
          <VBtn color="primary" @click="cancelCreate">Cancel</VBtn>
          <VBtn color="primary" @click="create">Create</VBtn>
        </template>
      </VCard>
    </VDialog>
    <ProgressDialog :model-value="progressing"
      title="Setting up kubectl shell" :text="progressMessage" />
    <ExecTerminal v-if="state === State.READY"
      style="height: calc(100dvh - 64px - 32px)"
      :command="['/bin/sh', '-c', '/bin/bash; kill 2']"
      :container-spec="{ namespace: selectedNamespace,
        pod: podName, container: SUPPORTING_CONTAINER_NAME }"
      @closed="cleanup(selectedNamespace)" />
    <template v-if="state === State.USER_CANCELED">
      This feature requires supporting pod.
    </template>
  </div>
</template>
