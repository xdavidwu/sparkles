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
  VList,
  VListItem,
  VMain,
  VNavigationDrawer,
  VToolbarTitle,
} from 'vuetify/components';
</script>

<template>
  <VApp>
    <VAppBar>
      <VAppBarNavIcon @click="drawer = !drawer" />
      <VToolbarTitle>{{ title }}</VToolbarTitle>
    </VAppBar>
    <VNavigationDrawer v-model="drawer">
      <VList>
        <VListItem :to="{ name: 'settings' }">Settings</VListItem>
        <VListItem :to="{ name: 'about' }">About</VListItem>
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
    <VMain style="width: 95vw; /* XXX */">
      <VContainer fluid>
        <RouterView />
      </VContainer>
    </VMain>
  </VApp>
</template>

<script lang="ts">
import { ResponseError, FetchError } from '@/kubernetes-api/src';

export default {
  props: {
    title: {
      type: String,
      default: import.meta.env.VITE_APP_BRANDING ?? 'Kubernetes SPA Client',
    },
  },
  data: () => ({ drawer: null, showsDialog: false, failedResponse: null, failedResponseText: '' }),
  errorCaptured(err) {
    if (err instanceof ResponseError) {
      this.failedResponse = err.response;
      err.response.text().then(t => this.failedResponseText = t);
      this.showsDialog = true;
      return false;
    } else if (err instanceof FetchError) {
      this.failedResponse = null;
      this.failedResponseText = err.cause;
      this.showsDialog = true;
      return false;
    }
  },
}
</script>

<style>
/* XXX: is absent of this bug in VListItem? */
:root {
  --v-theme-overlay-multiplier: 1;
}
</style>
