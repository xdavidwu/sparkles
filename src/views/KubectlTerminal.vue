<script setup lang="ts">
import { VBtn, VCard, VDialog } from 'vuetify/components';
import AttachTerminal from '@/components/AttachTerminal.vue';
import { ref, watch, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useEventListener } from '@vueuse/core';
import { useApiConfig } from '@/stores/apiConfig';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useNamespaces } from '@/stores/namespaces';
import {
  descriptionAnnotation, errorIsResourceNotFound, bySSA,
  restrictedSecurityContext, V1WatchEventType,
} from '@/utils/api';
import { brand } from '@/utils/config';
import { managedByLabel } from '@/utils/contracts';
import { ignore } from '@/utils/lang';
import { withProgress } from '@/utils/progressReport';
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

const name = 'sparkles-kubectl-shell';
const POD_PREFIX = `${name}-`;
const CONTAINER_NAME = 'kubectl';
const SERVICEACCOUNT_NAME = name;
const ROLEBINDING_NAME = name;

const cancelCreate = () => state.value = State.USER_CANCELED;

const create = () => withProgress('Setting up kubectl shell', async (progress) => {
  state.value = State.CREATING;
  progress('Creating supporting pod');

  const serviceAccount: V1ServiceAccount = {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: SERVICEACCOUNT_NAME,
      labels: managedByLabel,
      annotations: {
        [descriptionAnnotation]: `Used for kubectl shell functionality in ${brand}.`,
      },
    },
  };
  const roleBinding: V1RoleBinding = {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
      name: ROLEBINDING_NAME,
      labels: managedByLabel,
      annotations: {
        [descriptionAnnotation]: `Used for kubectl shell functionality in ${brand}.`,
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
      name: SERVICEACCOUNT_NAME,
    }],
  };
  const pod: V1Pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      generateName: POD_PREFIX,
      labels: managedByLabel,
      annotations: {
        [descriptionAnnotation]:
          `Pod that implements kubectl shell funtionality in ${brand}. ` +
          'A pod is used per kubectl shell session, with ServiceAccount of admin role under the same namespace. ' +
          'Will be deleted automatically when user exit the session, ' +
          'but may still be left running if the browser crashes. ' +
          'In that case, you can delete this manually.',
      },
    },
    spec: {
      containers: [{
        name: CONTAINER_NAME,
        image: 'ghcr.io/xdavidwu/sparkles/kubectl-shell:latest',
        stdin: true,
        stdinOnce: true,
        tty: true,
        securityContext: restrictedSecurityContext,
      }],
      serviceAccountName: SERVICEACCOUNT_NAME,
      terminationGracePeriodSeconds: 0,
      restartPolicy: 'Never',
    },
  };

  await api.patchNamespacedServiceAccount({
    namespace: selectedNamespace.value,
    name: SERVICEACCOUNT_NAME,
    force: true,
    body: serviceAccount,
  }, bySSA);

  await Promise.all([
    api.createNamespacedPod({
      namespace: selectedNamespace.value,
      body: pod,
    }).then((pod) => podName.value = pod.metadata!.name!),
    rbacApi.patchNamespacedRoleBinding({
      namespace: selectedNamespace.value,
      name: ROLEBINDING_NAME,
      force: true,
      body: roleBinding,
    }, bySSA),
  ]);

  progress('Waiting for supporting pod to become ready');
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
          (s) => s.name === CONTAINER_NAME)?.ready ?? false;
      } else if (ev.type === V1WatchEventType.DELETED) {
        throw new PresentedError('Supporting pod deleted on cluster');
      }
      return false;
    }
  );

  state.value = State.READY;
});

const cleanup = async (namespace?: string, name?: string) =>
  podName.value && await ignore(
    api.deleteNamespacedPod({
      namespace: namespace ?? selectedNamespace.value,
      name: name ?? podName.value,
    }),
    errorIsResourceNotFound
  );

watch(selectedNamespace, async (to: string, from: string) => {
  const p = cleanup(from);
  podName.value = '';
  state.value = State.ASK_FOR_CREATING;
  await p;
});

onUnmounted(() => cleanup());

useEventListener(window, 'beforeunload', () => cleanup());

const checkAndCleanup = async () => {
  const namespace = selectedNamespace.value;
  const name = podName.value;
  await watchUntil(
    (opt) => api.listNamespacedPodRaw({
      namespace,
      fieldSelector: `metadata.name=${name}`,
      ...opt
    }),
    V1PodFromJSON,
    (ev) => {
      if (ev.type === V1WatchEventType.ADDED ||
          ev.type === V1WatchEventType.MODIFIED) {
        const terminationStatus = ev.object.status?.containerStatuses?.find(
          (s) => s.name === CONTAINER_NAME)?.state?.terminated;
        const terminated = !!terminationStatus;
        if (terminated && terminationStatus.reason != 'Completed') {
          useErrorPresentation().pendingToast =
            terminationStatus.reason == 'Error' ?
              `Container terminated with code ${terminationStatus.exitCode}.`:
              `Container terminated due to ${terminationStatus.reason}.`;
        }
        return terminated;
      }
      return ev.type === V1WatchEventType.DELETED;
    },
    true,
  );
  await cleanup(namespace, name);
};
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
    <AttachTerminal v-if="state === State.READY"
      style="height: calc(100dvh - 64px - 32px)"
      :container-spec="{ namespace: selectedNamespace,
        pod: podName, container: CONTAINER_NAME }"
      @closed="checkAndCleanup" shell />
    <template v-if="state === State.USER_CANCELED">
      This feature requires supporting pod.
    </template>
  </div>
</template>
