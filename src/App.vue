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
  VContainer,
  VDialog,
  VDivider,
  VList,
  VListItem,
  VListSubheader,
  VMain,
  VNavigationDrawer,
  VSnackbar,
} from 'vuetify/components';
import IdentityIndicator from '@/components/IdentityIndicator.vue';
import LoadingSuspense from '@/components/LoadingSuspense.vue';
import ProgressDialog from '@/components/ProgressDialog.vue';
import { useNamespaces } from '@/stores/namespaces';
import { storeToRefs } from 'pinia';
import { computed, ref, onErrorCaptured, watch } from 'vue';
import { ResponseError, FetchError, V1StatusFromJSON } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { PresentedError } from '@/utils/PresentedError';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { useApiConfig, AuthScheme } from '@/stores/apiConfig';
import { useProgress } from '@/stores/progress';
import { renderAppTabs } from '@/composables/appTabs';
import { useRouter } from 'vue-router';
import { Category } from '@/router';
import { useTitle } from '@vueuse/core';
import { brand } from '@/utils/config';
import { stringify } from '@/utils/yaml';
import { parse } from 'yaml';

const { namespaces, selectedNamespace, loading: namespacesLoading } = storeToRefs(useNamespaces());
const { pendingError, pendingToast } = storeToRefs(useErrorPresentation());
const configStore = useApiConfig();
const { authScheme } = storeToRefs(configStore);
const { normalizePath } = configStore;
const {
  active: progressActive,
  title: progressTitle,
  text: progressText,
} = storeToRefs(useProgress());

const drawer = ref<boolean | undefined>();
const { expandAppBar, appBarHeightPX, appTabsUsed } = renderAppTabs();
const showsDialog = ref(false);
const showsSnackbar = ref(false);
const snackbarMessage = ref('');
const failedResponse = ref<Response | undefined>();
const failedResponseUrl = computed(() =>
  failedResponse.value ? normalizePath(failedResponse.value.url) : '');
const failedMessage = ref('');
const loadError = ref(false);
const router = useRouter();
const route = router.currentRoute;
const routes = computed(() => {
  const all = router.getRoutes().map((r) => ({
    ...r,
    unsupportedReason: r.meta.unsupported?.value,
  }));
  return Object.fromEntries(Object.values(Category).map((k) => [k, all.filter((r) => r.meta.category == k)]));
});
const title = computed(() => `${route.value.meta.name} - ${brand}`);
useTitle(title);
const isOIDC = computed(() => authScheme.value === AuthScheme.OIDC);
const logoutHref = router.resolve('/oidc/logout').href;
const visibleCategories = Object.values(Category).filter((c) => c != Category.HIDDEN);

const reload = () => window.location.reload();

window.addEventListener('vite:preloadError', () => {
  loadError.value = true;
});

const handleError = (err: unknown) => {
  console.log(err);
  if (err instanceof ResponseError) {
    failedResponse.value = err.response;
    err.response.text().then(t => {
      try {
        const o = parse(t);
        const status = V1StatusFromJSON(o);
        if (status.message || status.reason) {
          failedMessage.value = status.message ? status.message : status.reason!;
        } else {
          failedMessage.value = stringify(o);
        }
      } catch {
        failedMessage.value = t;
      }
    });
    showsDialog.value = true;
    return false;
  } else if (err instanceof FetchError) {
    failedResponse.value = undefined;
    failedMessage.value = err.cause.message;
    showsDialog.value = true;
    return false;
  } else if (err instanceof PresentedError) {
    failedResponse.value = undefined;
    failedMessage.value = err.message;
    showsDialog.value = true;
    return false;
  }
};

onErrorCaptured(handleError);

watch(pendingError, (error) => {
  if (error) {
    pendingError.value = undefined;
    handleError(error);
  }
});

watch(pendingToast, (toast) => {
  if (toast) {
    console.log(toast);
    snackbarMessage.value = toast;
    showsSnackbar.value = true;
    pendingToast.value = undefined;
  }
});
</script>

<template>
  <VApp>
    <VAppBar>
      <VAppBarNavIcon @click="drawer = !drawer" />
      <VAppBarTitle>{{ brand }}</VAppBarTitle>
      <template v-if="expandAppBar && appTabsUsed" #extension>
        <div id="appbar-tabs" class="w-100" />
      </template>
      <div v-if="!expandAppBar && appTabsUsed" id="appbar-tabs"
        style="left: 256px; bottom: 0; width: calc(100vw - 256px)"
        class="position-absolute flex-0-1 d-flex flex-column justify-end" />
    </VAppBar>
    <VNavigationDrawer v-model="drawer">
      <VList v-for="category in visibleCategories" :key="category">
        <VAutocomplete v-if="category == Category.NAMESPACED"
          label="Namespace" variant="solo" v-model="selectedNamespace"
          :items="namespaces" :loading="namespacesLoading"
          hide-details auto-select-first />
        <template v-else>
          <VDivider />
          <VListSubheader>{{ category }}</VListSubheader>
        </template>
        <VListItem v-for="route in routes[category]"
          :disabled="!!route.unsupportedReason"
          :subtitle="route.unsupportedReason" :title="route.meta.name"
          :key="route.meta.name as string" :to="route" />
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
      <VCard title="Operation failed" class="align-self-center mw-100">
        <template #text><VContainer class="pa-0">
          <p v-if="failedResponse" class="mb-1">
            Kubernetes returned error:<br>
            {{ failedResponse.status }} {{ failedResponse.statusText }}
            <span class="text-caption text-medium-emphasis">at {{ failedResponseUrl }}</span>
            <br>
          </p>
          <pre class="text-pre-wrap">{{ failedMessage }}</pre>
        </VContainer></template>
        <template #actions>
          <VBtn color="primary" @click="showsDialog = false">Close</VBtn>
        </template>
      </VCard>
    </VDialog>
    <VDialog v-model="loadError">
      <VCard title="Page load failed" class="align-self-center mw-100">
        <template #text><VContainer class="pa-0">
          If your network access is working,
          this may indicates that a new version of {{ brand }} is available.
          Reload the page to update to the new version.
        </VContainer></template>
        <template #actions>
          <VBtn color="primary" @click="reload">Reload</VBtn>
        </template>
      </VCard>
    </VDialog>
    <ProgressDialog :model-value="progressActive"
      :title="progressTitle" :text="progressText" />
    <VMain>
      <VContainer fluid class="overflow-y-auto h-0"
        :style="`min-height: calc(100dvh - ${appBarHeightPX}px)`">
        <RouterView #="{ Component }">
          <LoadingSuspense>
            <component v-if="Component" :is="Component" />
          </LoadingSuspense>
        </RouterView>
      </VContainer>
      <VSnackbar v-model="showsSnackbar" class="text-pre-wrap">
        {{ snackbarMessage }}
        <template #actions>
          <VBtn variant="text" @click="showsSnackbar = false">Close</VBtn>
        </template>
      </VSnackbar>
    </VMain>
  </VApp>
</template>

<style scoped>
.mw-100 {
  max-width: 100%;
}

.bottom-auth-line {
  background-color: rgb(var(--v-theme-surface-light));
  color: rgb(var(--v-theme-on-surface-light));
}
</style>

<style>
/*
 * color stolen from chromium: https://github.com/whatwg/html/issues/5426#issuecomment-904021675
 */

a:not([class^="v-"]) {
  color: #9e9eff;
}

a:not([class^="v-"]):visited {
  color: #d0adf0;
}

a:not([class^="v-"]):active, a:not([class^="v-"]):visited:active {
  color: #ff9e9e;
}

:root {
  --markdown-code-background: black;
}

.markdown :is(h1, h2, h3, h4, h5, h6, p, table):first-child {
  margin-top: 0;
}

.markdown :is(h1, h2, h3, h4, h5, h6, p, table):last-child {
  margin-bottom: 0;
}

.markdown :is(h1, h2, h3, h4, h5, h6, p, table) {
  margin-top: 0.4lh;
  margin-bottom: 0.2lh;
}

.markdown li {
  margin-left: 24px;
  margin-top: 2px;
}

.markdown code {
  padding: 0 2px;
  background: var(--markdown-code-background);
}

.markdown pre > code {
  padding: 4px;
  display: block;
  background: #282c34;
  color: #abb2bf;
}

.markdown table {
  border-collapse: collapse;
}

.markdown :is(th, td) {
  border: 2px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 4px 8px;
}

td.v-data-table__td:empty::before {
  content: '(None)';
  opacity: var(--v-disabled-opacity);
}
</style>
