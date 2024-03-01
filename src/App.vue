<script setup lang="ts">
import { RouterView } from 'vue-router';
import {
  VApp,
  VAppBar,
  VAppBarNavIcon,
  VAppBarTitle,
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
  VProgressCircular,
  VSnackbar,
  VSpacer,
} from 'vuetify/components';
import IdentityIndicator from '@/components/IdentityIndicator.vue';
import { useNamespaces } from '@/stores/namespaces';
import { storeToRefs } from 'pinia';
import { computed, ref, onErrorCaptured, watch } from 'vue';
import { ResponseError, FetchError, V1StatusFromJSON } from '@/kubernetes-api/src';
import { PresentedError } from '@/utils/PresentedError';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';
import { useRouter } from 'vue-router';
import { useTitle } from '@vueuse/core';
import { useDisplay } from 'vuetify';

const brand = import.meta.env.VITE_APP_BRANDING ?? 'Sparkles';

const { namespaces, selectedNamespace, loading: namespacesLoading } = storeToRefs(useNamespaces());
const { pendingError, pendingToast } = storeToRefs(useErrorPresentation());

const drawer = ref<boolean | null>(null);
const { xs: expandAppBar } = useDisplay();
const showsDialog = ref(false);
const showsSnackbar = ref(false);
const snackbarMessage = ref('');
const failedResponse = ref<Response | null>(null);
const failedResponseText = ref('');
const router = useRouter();
const route = router.currentRoute;
const routes = computed(() => router.getRoutes().filter(r => !r.meta.hidden).map(r => {
  return {
    ...r,
    unsupportedReason: r.meta.unsupported?.value,
  }
}));
const namespacedRoutes = computed(() => routes.value.filter(r => r.meta.namespaced));
const globalRoutes = computed(() => routes.value.filter(r => !r.meta.namespaced));
const title = computed(() => `${route.value.meta.name} - ${brand}`);
useTitle(title);
const { authScheme, configurable } = storeToRefs(useApiConfig());
const isOIDC = computed(() => authScheme.value === AuthScheme.OIDC);
const logoutHref = router.resolve('/oidc/logout').href;

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

watch(pendingToast, (toast) => {
  if (toast) {
    console.log(toast);
    snackbarMessage.value = toast;
    showsSnackbar.value = true;
    pendingToast.value = null;
  }
});

// XXX: find a way to re-teleport?
watch(expandAppBar, () => window.location.reload());
</script>

<template>
  <VApp>
    <VAppBar>
      <VAppBarNavIcon @click="drawer = !drawer" />
      <VAppBarTitle style="max-width: calc(256px - 64px - 10px)">{{ brand }}</VAppBarTitle>
      <template v-if="expandAppBar" #extension>
        <div id="appbar-tabs" />
      </template>
      <div v-if="!expandAppBar" id="appbar-tabs" style="height: 64px; width: calc(100vw - 256px)"
        class="flex-0-1 d-flex flex-column justify-end" />
    </VAppBar>
    <VNavigationDrawer v-model="drawer">
      <VList>
        <VAutocomplete label="Namespace" variant="solo" :items="namespaces"
          v-model="selectedNamespace" hide-details :loading="namespacesLoading" />
        <VListItem v-for="route in namespacedRoutes"
          :key="route.meta.name as string" :to="route">
          {{ route.meta.name }}
        </VListItem>
      </VList>
      <VDivider />
      <VList>
        <VListSubheader>Global</VListSubheader>
        <VListItem v-for="route in globalRoutes"
          :disabled="!!route.unsupportedReason"
          :subtitle="route.unsupportedReason"
          :key="route.meta.name as string" :to="route">
          {{ route.meta.name }}
        </VListItem>
      </VList>
      <template #append>
        <div class="px-4 bottom-auth-line text-caption py-1 w-100">
          <IdentityIndicator />
          <VBtn v-if="isOIDC"
            class="float-right" variant="text" size="x-small" color="primary"
            :href="logoutHref">Log out</VBtn>
        </div>
      </template>
    </VNavigationDrawer>
    <VDialog v-model="showsDialog">
      <VCard title="Operation failed">
        <VCardText>
          <p v-if="failedResponse" class="mb-1">
            Cannot perform request to Kubernetes:<br>
            {{ failedResponse.status }} {{ failedResponse.statusText }}
            <span class="text-caption text-medium-emphasis">at {{ failedResponse.url }}</span>
            <br>
          </p>
          <p>{{ failedResponseText }}</p>
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn v-if="configurable" color="primary"
            @click="showsDialog = false; router.push({ name: 'settings' })">
            Settings
          </VBtn>
          <VBtn color="primary" @click="showsDialog = false">Close</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    <VMain>
      <VContainer fluid class="overflow-y-auto">
        <RouterView #="{ Component }">
          <Suspense timeout="16">
            <component v-if="Component" :is="Component" />
            <template #fallback>
              <div class="d-flex justify-center align-center flex-column full-height">
                <VProgressCircular indeterminate class="mb-4" />
                Loading...
              </div>
            </template>
          </Suspense>
        </RouterView>
      </VContainer>
      <VSnackbar v-model="showsSnackbar">
        {{ snackbarMessage }}
        <template #actions>
          <VBtn variant="text" @click="showsSnackbar = false">Close</VBtn>
        </template>
      </VSnackbar>
    </VMain>
  </VApp>
</template>

<style scoped>
.full-height {
  height: calc(100vh - 96px);
}

.bottom-auth-line {
  background-color: rgb(var(--v-theme-surface-light));
  color: rgb(var(--v-theme-on-surface-light));
}
</style>
