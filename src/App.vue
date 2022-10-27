<script setup lang="ts">
import { RouterView } from 'vue-router';
import {
  VApp,
  VAppBar,
  VAppBarNavIcon,
  VContainer,
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
        <VListItem :to="{ name: 'home' }">Home</VListItem>
        <VListItem :to="{ name: 'about' }">About</VListItem>
        <VListItem :to="{ name: 'explore' }">Resource Explorer</VListItem>
      </VList>
    </VNavigationDrawer>
    <VMain style="width: 95vw; /* XXX */">
      <VContainer fluid>
        <RouterView />
      </VContainer>
    </VMain>
  </VApp>
</template>

<script lang="ts">
export default {
  props: {
    title: {
      type: String,
      default: import.meta.env.VITE_APP_BRANDING ?? 'Kubernetes SPA Client',
    },
  },
  data: () => ({ drawer: null }),
}
</script>

<style>
/* XXX: is absent of this bug in VListItem? */
:root {
  --v-theme-overlay-multiplier: 1;
}
</style>
