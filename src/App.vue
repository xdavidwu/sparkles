<script setup lang="ts">
import { RouterView } from 'vue-router';
import {
  VApp,
  VAppBar,
  VAppBarNavIcon,
  VAutocomplete,
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
  VToolbarTitle,
} from 'vuetify/components';
import { useNamespaces } from '@/stores/namespaces';
import { storeToRefs } from 'pinia';
import { computed, ref, onErrorCaptured, watch } from 'vue';
import { ResponseError, FetchError, V1StatusFromJSON } from '@/kubernetes-api/src';
import { PresentedError } from '@/utils/PresentedError';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useRouter } from 'vue-router';
import { useTitle } from '@vueuse/core';

const brand = import.meta.env.VITE_APP_BRANDING ?? 'Kubernetes SPA Client';

const { namespaces, selectedNamespace } = storeToRefs(useNamespaces());
const { pendingError } = storeToRefs(useErrorPresentation());

const drawer = ref<boolean | null>(null);
const showsDialog = ref(false);
const failedResponse = ref<Response | null>(null);
const failedResponseText = ref('');
const router = useRouter();
const route = router.currentRoute;
const routes = router.getRoutes().filter(r => !r.meta.hidden);
const namespacedRoutes = routes.filter(r => r.meta.namespaced);
const globalRoutes = routes.filter(r => !r.meta.namespaced);
const title = computed(() => `${route.value.meta.name} - ${brand}`);
useTitle(title);

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
      <VToolbarTitle>{{ brand }}</VToolbarTitle>
    </VAppBar>
    <VNavigationDrawer v-model="drawer">
      <VList>
        <VAutocomplete label="Namespace" variant="solo" :items="namespaces"
          v-model="selectedNamespace" hide-details />
        <VListItem v-for="route in namespacedRoutes"
          :key="route.meta.name as string" :to="route">
          {{ route.meta.name }}
        </VListItem>
      </VList>
      <VDivider />
      <VList>
        <VListSubheader>Global</VListSubheader>
        <VListItem v-for="route in globalRoutes"
          :key="route.meta.name as string" :to="route">
          {{ route.meta.name }}
        </VListItem>
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
            @click="showsDialog = false; router.push({ name: 'settings' })">
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
