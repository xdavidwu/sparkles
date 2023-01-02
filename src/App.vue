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

const namespaceStore = useNamespaces();
const { namespaces, selectedNamespace } = storeToRefs(namespaceStore);
</script>

<template>
  <VApp>
    <VAppBar>
      <VAppBarNavIcon @click="drawer = !drawer" />
      <VToolbarTitle>{{ title }}</VToolbarTitle>
    </VAppBar>
    <VNavigationDrawer v-model="drawer">
      <VSelect label="Namespace" variant="solo" :items="namespaces"
        v-model="selectedNamespace"/>
      <VDivider />
      <VList>
        <VListSubheader>Namespaced</VListSubheader>
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
          <pre>{{ failedResponseText }}</pre>
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

<script lang="ts">
import { defineComponent } from 'vue';
import { ResponseError, FetchError } from '@/kubernetes-api/src';

interface Data {
  drawer: boolean | null,
  showsDialog: boolean,
  failedResponse: Response | null,
  failedResponseText: string,
}

export default defineComponent({
  props: {
    title: {
      type: String,
      default: import.meta.env.VITE_APP_BRANDING ?? 'Kubernetes SPA Client',
    },
  },
  data: (): Data => ({ drawer: null, showsDialog: false, failedResponse: null, failedResponseText: '' }),
  errorCaptured(err) {
    if (err instanceof ResponseError) {
      this.failedResponse = err.response;
      err.response.text().then(t => this.failedResponseText = t);
      this.showsDialog = true;
      return false;
    } else if (err instanceof FetchError) {
      this.failedResponse = null;
      this.failedResponseText = err.cause.message;
      this.showsDialog = true;
      return false;
    }
  },
});
</script>
