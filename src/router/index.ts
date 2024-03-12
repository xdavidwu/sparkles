import { createRouter, createWebHistory } from 'vue-router';
import { computedAsync } from '@vueuse/core';
import HomeView from '@/views/HomeView.vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';

declare global {
  interface Window {
    __base_url: string;
  }
}

const dns1123LabelFmt = '[a-z0-9]([-a-z0-9]*[a-z0-9])?';
const dns1123SubdomainFmt = `${dns1123LabelFmt}(\\.${dns1123LabelFmt})*`;
// TODO IANA_SVC_NAME/integer validation
const schemeNamePort = `((https?|):)?${dns1123SubdomainFmt}(:[^:/]*)?`;
const apiserverProxyRegex = new RegExp(`^/api/v1/namespaces/${dns1123SubdomainFmt}/(pods|services)/${schemeNamePort}/proxy/`);
const m = window.location.pathname.match(apiserverProxyRegex);
window.__base_url = m === null ? import.meta.env.BASE_URL : m[0];

const router = createRouter({
  history: createWebHistory(window.__base_url),
  routes: [
    // namespaced
    {
      path: '/pods',
      name: 'pods',
      component: () => import('@/views/PodsList.vue'),
      meta: { name: 'Pods', namespaced: true },
    },
    {
      path: '/quotas',
      name: 'quotas',
      component: () => import('@/views/QuotasUsage.vue'),
      meta: { name: 'Quotas', namespaced: true },
    },
    {
      path: '/helm',
      name: 'helm',
      component: () => import('@/views/HelmList.vue'),
      meta: { name: 'Helm', namespaced: true },
    },
    // global
    {
      path: '/explore',
      name: 'explore',
      component: () => import('@/views/ResourceExplorer.vue'),
      meta: { name: 'Resource Explorer' },
    },
    {
      path: '/metrics',
      name: 'metrics',
      component: () => import('@/views/NodesMetrics.vue'),
      meta: { name: 'Nodes Metrics', unsupported: computedAsync(async () => {
        const groups = await useApisDiscovery().getGroups();
        if (!groups.some((g) => g.name === 'metrics.k8s.io')) {
          return 'Metrics not supported by cluster';
        }
        return undefined;
      }, undefined, { lazy: true }) },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/APISettings.vue'),
      meta: { name: 'About' },
    },
    // hidden
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { name: 'Home', hidden: true },
    },
    {
      path: '/helm/repo',
      name: 'helm_repo',
      component: () => import('@/components/HelmRepository.vue'),
      meta: { name: 'Helm repo', hidden: true },
    },
    // handled @ @/OIDCApp.vue, should not be rendered by router
    {
      path: '/oidc/callback',
      name: 'oidc_callback',
      component: () => { throw new Error('unexpected OIDC route visit, misconfiguration?'); },
      meta: { name: 'OIDC Callback', hidden: true },
    },
    {
      path: '/oidc/logout',
      name: 'oidc_logout',
      component: () => { throw new Error('unexpected OIDC route visit, misconfiguration?'); },
      meta: { name: 'OIDC Logout', hidden: true },
    },
  ]
});

export default router;
