<script setup lang="ts">
import { VBtn, VCard, VDataTable, VDatePicker, VDialog, VTextarea, VTextField } from 'vuetify/components';
import FixedFab from '@/components/FixedFab.vue';
import TippedBtn from '@/components/TippedBtn.vue';
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { useNamespaces } from '@/stores/namespaces';
import { useLoading } from '@/composables/loading';
import { useAbortController } from '@/composables/abortController';
import { fromYAMLSSA } from '@/utils/api';
import {
  managedByLabel,
  tokenHandleSecretType,
  tokenNoteAnnotation, tokenExpiresAtAnnotation,
} from '@/utils/contracts';
import { listAndUnwaitedWatch } from '@/utils/watch';
import { notifyListingWatchErrors } from '@/utils/errors';
import {
  CoreV1Api, RbacAuthorizationV1Api,
  type V1Secret, type V1ServiceAccount, type V1RoleBinding, type AuthenticationV1TokenRequest,
  V1SecretFromJSON,
} from '@xdavidwu/kubernetes-client-typescript-fetch';
import { createNameId } from 'mnemonic-id';

const config = await useApiConfig().getConfig();
const api = new CoreV1Api(config);
const rbacApi = new RbacAuthorizationV1Api(config);
const { selectedNamespace } = storeToRefs(useNamespaces());

const secrets = ref<Array<V1Secret>>([]);

const creatingToken = ref(false);
const creatingNote = ref('');
const creatingExpiresAt = ref(new Date());
creatingExpiresAt.value.setDate(creatingExpiresAt.value.getDate() + 1);
const pickingDate = ref(false);
const tokenCreated = ref(false);
const token = ref('');

const name = 'sparkles-serviceaccount-tokens';
const SECRET_PREFIX = `${name}-handle-`;
const SERVICEACCOUNT_NAME = name;
const ROLEBINDING_NAME = name;

const columns = [
  {
    title: 'Note',
    key: `metadata.annotations[${tokenNoteAnnotation}]`,
    value: (o: V1Secret) => o.metadata!.annotations?.[tokenNoteAnnotation],
    cellProps: {
      class: 'text-pre-wrap py-2',
    },
  },
  {
    title: 'Created at',
    key: 'metadata.creationTimestamp',
  },
  {
    title: 'Expires at',
    key: `metadata.annotations[${tokenExpiresAtAnnotation}]`,
    value: (o: V1Secret) => o.metadata!.annotations?.[tokenExpiresAtAnnotation],
  },
  {
    title: 'Actions',
    key: 'actions',
    value: () => '',
    sortable: false,
    nowrap: true,
    width: 0,
    cellProps: {
      class: 'ps-1',
    },
  },
];

const { abort: abortRequests, signal } = useAbortController();

const { load, loading } = useLoading(async () => {
  abortRequests();

  await listAndUnwaitedWatch(secrets, V1SecretFromJSON,
    (opt) => api.listNamespacedSecretRaw({
      ...opt,
      namespace: selectedNamespace.value,
      fieldSelector: `type=${tokenHandleSecretType}`,
    }, { signal: signal.value }),
    notifyListingWatchErrors,
  );

  // attempt gc
  await Promise.all(secrets.value.filter(
    (s) => s.metadata!.annotations?.[tokenExpiresAtAnnotation] &&
      (new Date(s.metadata!.annotations[tokenExpiresAtAnnotation]) < new Date()))
    .map((s) => api.deleteNamespacedSecret({
      namespace: s.metadata!.namespace!, name: s.metadata!.name! })));
});

watch(selectedNamespace, load, { immediate: true });

const encodeBlob = (o: object) => new Blob([JSON.stringify(o)]);
const create = async () => {
  creatingExpiresAt.value.setHours(0);
  creatingExpiresAt.value.setMinutes(0);
  creatingExpiresAt.value.setSeconds(0);

  const serviceAccount: V1ServiceAccount = {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: SERVICEACCOUNT_NAME,
      labels: managedByLabel,
    },
  };
  const roleBinding: V1RoleBinding = {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
      name: ROLEBINDING_NAME,
      labels: managedByLabel,
    },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'edit',
    },
    subjects: [{
      kind: 'ServiceAccount',
      namespace: selectedNamespace.value,
      name: SERVICEACCOUNT_NAME,
    }],
  };
  const secret: V1Secret = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: `${SECRET_PREFIX}${createNameId()}`,
      labels: managedByLabel,
      annotations: {
        [tokenNoteAnnotation]: creatingNote.value,
      },
    },
    type: tokenHandleSecretType,
  };

  const tokenRequest: AuthenticationV1TokenRequest = {
    apiVersion: 'authentication.k8s.io/v1',
    kind: 'TokenRequest',
    spec: {
      audiences: [],
      boundObjectRef: {
        apiVersion: 'v1',
        kind: 'Secret',
        name: secret.metadata!.name,
      },
      expirationSeconds: Math.round((creatingExpiresAt.value.valueOf() - (new Date()).valueOf()) / 1000),
    },
  };

  await api.patchNamespacedServiceAccount({
    namespace: selectedNamespace.value,
    name: SERVICEACCOUNT_NAME,
    force: true,
    body: encodeBlob(serviceAccount),
  }, fromYAMLSSA);


  await Promise.all([
    rbacApi.patchNamespacedRoleBinding({
      namespace: selectedNamespace.value,
      name: ROLEBINDING_NAME,
      force: true,
      body: encodeBlob(roleBinding),
    }, fromYAMLSSA),
    api.createNamespacedSecret({
      namespace: selectedNamespace.value,
      body: secret,
    }),
  ]);

  const result = await api.createNamespacedServiceAccountToken({
    namespace: selectedNamespace.value,
    name: SERVICEACCOUNT_NAME,
    body: tokenRequest,
  });

  secret.metadata!.annotations![tokenExpiresAtAnnotation] = result.status!.expirationTimestamp.toISOString();

  await api.patchNamespacedSecret({
    namespace: selectedNamespace.value,
    name: secret.metadata!.name!,
    body: encodeBlob(secret),
  }, fromYAMLSSA);

  token.value = result.status!.token;
  creatingToken.value = false;
  tokenCreated.value = true;
};

const copy = () => navigator.clipboard.writeText(token.value);

const revoke = async (s: V1Secret) => {
  await api.deleteNamespacedSecret({
    namespace: s.metadata!.namespace!,
    name: s.metadata!.name!,
  });
};
</script>

<template>
  <div>
    <VDataTable :items="secrets" :loading="loading" :headers="columns">
      <template #[`item.actions`]="{ item }">
        <TippedBtn tooltip="Revoke" icon="mdi-delete" size="small"
          variant="text" @click="revoke(item)" />
      </template>
      <template #[`item.metadata.annotations[${tokenExpiresAtAnnotation}]`]="{ value }">
        {{ (new Date(value)).toLocaleString() }}
      </template>
      <template #[`item.metadata.creationTimestamp`]="{ value }">
        {{ value.toLocaleString() }}
      </template>
    </VDataTable>
    <FixedFab icon="$plus" @click="creatingToken = true" />
    <VDialog v-model="creatingToken" width="auto">
      <VCard title="Creating token">
        <template #text>
          <div class="text-subtitle-2 mb-4">
            Fill up the form below to create a token of Kubernetes API with permission to use this namespace.
          </div>
          <VTextField :model-value="creatingExpiresAt.toLocaleDateString()"
            label="Expires at" readonly
            @click="pickingDate = true" @keydown="pickingDate = true" />
          <VTextarea v-model="creatingNote" label="Note" clearable
            placeholder="Describe what this token is for" />
        </template>
        <template #actions>
          <VBtn color="primary" @click="creatingToken = false">Cancel</VBtn>
          <VBtn color="primary" @click="create">Create</VBtn>
        </template>
      </VCard>
    </VDialog>
    <VDialog v-model="tokenCreated" width="auto">
      <VCard title="Token created">
        <template #text>
          <div class="text-subtitle-2 mb-4">
            Be sure to save it as it will not be shown again.
          </div>
          <div class="d-flex flex-row ga-1 align-center">
          <VTextField :model-value="token" label="Token" type="password"
            readonly hide-details />
          <TippedBtn tooltip="Copy to clipboard"
            icon="mdi-clipboard-text-multiple" variant="text" @click="copy" />
          </div>
        </template>
        <template #actions>
          <VBtn color="primary" @click="tokenCreated = false">Close</VBtn>
        </template>
      </VCard>
    </VDialog>
    <VDialog v-model="pickingDate" width="auto" :scrim="false">
      <VDatePicker v-model="creatingExpiresAt"
        :min="(new Date()).toISOString()"
        title="Select expiration date" header="Pick date" color="primary"
        @update:modelValue="pickingDate = false" />
    </VDialog>
  </div>
</template>
