<script setup lang="ts">
import { VBtn, VCard, VDialog } from 'vuetify/components';
import ExecTerminal from '@/components/ExecTerminal.vue';
import ProgressDialog from '@/components/ProgressDialog.vue';
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useNamespaces } from '@/stores/namespaces';
import { fromYAMLSSA, V1WatchEventType } from '@/utils/api';
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
  LOADING,
  ASK_FOR_CREATING,
  CREATING,
  READY,
  USER_CANCELED,
}

const state = ref(State.LOADING);
const progressMessage = ref('');
const progressing = ref(false);

const SUPPORTING_POD_NAME = 'sparkles-kubectl-shell';
const SUPPORTING_CONTAINER_NAME = 'kubectl';
const SUPPORTING_SERVICEACCOUNT_NAME = SUPPORTING_POD_NAME;
const SUPPORTING_ROLEBINDING_NAME = SUPPORTING_POD_NAME;

const load = async () => {
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

  const managedByLabel = {
    'apps.kubernetes.io/managed-by': 'sparkles',
  };
  const serviceAccount: V1ServiceAccount = {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: SUPPORTING_SERVICEACCOUNT_NAME,
    },
  };
  const roleBinding: V1RoleBinding = {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
      name: SUPPORTING_ROLEBINDING_NAME,
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
      name: SUPPORTING_POD_NAME,
      labels: managedByLabel,
    },
    spec: {
      containers: [{
        name: SUPPORTING_CONTAINER_NAME,
        // TODO find a better one with completion, helm, match version with cluster
        image: 'bitnami/kubectl',
        command: ['/bin/sleep', 'infinity'],
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
    },
  };

  await api.patchNamespacedServiceAccount({
    namespace: selectedNamespace.value,
    name: SUPPORTING_SERVICEACCOUNT_NAME,
    force: true,
    body: encodeBlob(serviceAccount),
  }, fromYAMLSSA);

  await Promise.all([
    api.patchNamespacedPod({
      namespace: selectedNamespace.value,
      name: SUPPORTING_POD_NAME,
      force: true,
      body: encodeBlob(pod),
    }, fromYAMLSSA),
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
  progressMessage.value = 'Waiting supporting pod to become ready';
  progressing.value = true;
  // TODO timeout?
  await watchUntil(
    (opt) => api.listNamespacedPodRaw({
      namespace: selectedNamespace.value,
      fieldSelector: `metadata.name=${SUPPORTING_POD_NAME}`,
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

watch(selectedNamespace, load);
</script>

<template>
  <div>
    <VDialog :model-value="state === State.ASK_FOR_CREATING" persistent width="auto">
      <VCard title="Use kubectl shell">
        <template #text>
          A supporting pod is required for a kubectl shell.
          <br />
          <br />
          This will create a supporting pod with privilege as admin role in this namespace if not already exists,
          <br />
          be careful if you have previously set up roles to allow others to attach or exec pods.
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
      :container-spec="{ namespace: selectedNamespace,
        pod: SUPPORTING_POD_NAME, container: SUPPORTING_CONTAINER_NAME }" />
    <template v-if="state === State.USER_CANCELED">
      This feature requires supporting pod.
    </template>
  </div>
</template>
