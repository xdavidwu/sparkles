<script setup lang="ts">
import { RouterView } from 'vue-router';
import {
  VApp,
  VAppBar,
  VAppBarNavIcon,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VContainer,
  VDialog,
  VDivider,
  VList,
  VListItem,
  VListSubheader,
  VMain,
  VNavigationDrawer,
  VSelect,
  VToolbarTitle,
} from 'vuetify/components';
import { useNamespaces } from '@/stores/namespaces';
import { storeToRefs } from 'pinia';
import { ref, onErrorCaptured, watch } from 'vue';
import { ResponseError, FetchError, V1StatusFromJSON } from '@/kubernetes-api/src';
import { PresentedError } from '@/utils/PresentedError';
import { useErrorPresentation } from '@/stores/errorPresentation';

const title = import.meta.env.VITE_APP_BRANDING ?? 'Kubernetes SPA Client';

const { namespaces, selectedNamespace } = storeToRefs(useNamespaces());
const { pendingError } = storeToRefs(useErrorPresentation());

const drawer = ref<boolean | null>(null);
const showsDialog = ref(false);
const failedResponse = ref<Response | null>(null);
const failedResponseText = ref('');

const handleError = (err: any) => {
  if (err instanceof ResponseError) {
    failedResponse.value = err.response;
    err.response.text().then(t => {
      try {
        const json = JSON.parse(t);
        const status = V1StatusFromJSON(json);
        if (status.message || status.reason) {
          failedResponseText.value = status.message ? status.message! : status.reason!;
        } else {
          failedResponseText.value = JSON.stringify(json, null, 2);
        }
      } catch (e) {
        failedResponseText.value = t;
      }
    });
    showsDialog.value = true;
    return false;
  } else if (err instanceof FetchError) {
    failedResponse.value = null;
    failedResponseText.value = err.cause.message;
    showsDialog.value = true;
    return false;
  } else if (err instanceof PresentedError) {
    failedResponse.value = null;
    failedResponseText.value = err.message;
    showsDialog.value = true;
    return false;
  }
};

onErrorCaptured(handleError);

watch(pendingError, (error) => {
  if (error) {
    pendingError.value = null;
    handleError(error);
  }
});
</script>

<template>
  <VApp>
    <VAppBar>
      <VAppBarNavIcon @click="drawer = !drawer" />
      <VToolbarTitle>{{ title }}</VToolbarTitle>
    </VAppBar>
    <VNavigationDrawer v-model="drawer">
      <VList>
        <VSelect label="Namespace" variant="solo" :items="namespaces"
          v-model="selectedNamespace"/>
        <VListItem :to="{ name: 'pods' }">Pods</VListItem>
      </VList>
      <VDivider />
      <VList>
        <VListSubheader>Global</VListSubheader>
        <VListItem :to="{ name: 'home' }">Home</VListItem>
        <VListItem :to="{ name: 'settings' }">Settings</VListItem>
        <VListItem :to="{ name: 'explore' }">Resource Explorer</VListItem>
      </VList>
    </VNavigationDrawer>
    <VDialog v-model="showsDialog">
      <VCard title="Request failed">
        <VCardText>
          <template v-if="failedResponse">
            <div>{{ failedResponse.url }}</div>
            <div>{{ failedResponse.status }} {{ failedResponse.statusText }}</div>
          </template>
          <pre class="text-wrap">{{ failedResponseText }}</pre>
        </VCardText>
        <VCardActions>
          <VBtn color="primary"
            @click="showsDialog = false; $router.push({ name: 'settings' })">
            Go to settings
          </VBtn>
          <VBtn @click="showsDialog = false">Close</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    <VMain>
      <VContainer fluid>
        <RouterView />
      </VContainer>
    </VMain>
  </VApp>
</template>
