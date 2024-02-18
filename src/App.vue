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
} from 'vuetify/components';
import IdentityIndicator from '@/components/IdentityIndicator.vue';
import { useNamespaces } from '@/stores/namespaces';
import { storeToRefs } from 'pinia';
import { computed, ref, onErrorCaptured, watch } from 'vue';
import { ResponseError, FetchError, V1StatusFromJSON } from '@/kubernetes-api/src';
import { PresentedError } from '@/utils/PresentedError';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useRouter } from 'vue-router';
import { useTitle } from '@vueuse/core';

const brand = import.meta.env.VITE_APP_BRANDING ?? 'Sparkles';

const { namespaces, selectedNamespace, loading: namespacesLoading } = storeToRefs(useNamespaces());
const { pendingError, pendingToast } = storeToRefs(useErrorPresentation());

const drawer = ref<boolean | null>(null);
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
</script>

<template>
  <VApp>
    <VAppBar>
      <VAppBarNavIcon @click="drawer = !drawer" />
      <VAppBarTitle>{{ brand }}</VAppBarTitle>
      <IdentityIndicator class="mr-6" />
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
</style>
