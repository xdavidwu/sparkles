import { storeToRefs } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { computedAsync } from '@vueuse/core';
import HomeView from '@/views/HomeView.vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useNamespaces } from '@/stores/namespaces';
import { usePermissions } from '@/stores/permissions';

declare global {
  interface Window {
    __base_url: string;
  }
}

const checkNamespacedResourcePermission =
  (group: string, resource: string) => computedAsync(async () => {
    const { selectedNamespace } = storeToRefs(useNamespaces());
    if (selectedNamespace.value) {
      const { mayAllows } = usePermissions();
      if (!await mayAllows(selectedNamespace.value, group, resource, '*', 'list')) {
        return 'Insufficient permission';
      }
      return undefined;
    } else {
      return undefined;
    }
  }, undefined, { lazy: true });

const router = createRouter({
  history: createWebHistory(window.__base_url),
  routes: [
    // namespaced
    {
      path: '/pods',
      name: 'pods',
      component: () => import('@/views/PodsList.vue'),
      meta: { name: 'Pods', namespaced: true, unsupported: checkNamespacedResourcePermission('', 'resourcequotas') },
    },
    {
      path: '/quotas',
      name: 'quotas',
      component: () => import('@/views/QuotasUsage.vue'),
      meta: { name: 'Quotas', namespaced: true, unsupported: checkNamespacedResourcePermission('', 'secrets') },
    },
    {
      path: '/helm',
      name: 'helm',
      component: () => import('@/views/HelmList.vue'),
      meta: { name: 'Helm', namespaced: true, unsupported: checkNamespacedResourcePermission('', 'secrets') }
    },
    {
      path: '/explore',
      name: 'explore',
      component: () => import('@/views/ResourceExplorer.vue'),
      meta: { name: 'Resource Explorer', namespaced: true },
    },
    // global
    {
      path: '/metrics',
      name: 'metrics',
      component: () => import('@/views/NodesMetrics.vue'),
      meta: { name: 'Nodes Metrics', unsupported: computedAsync(async () => {
        const groups = await useApisDiscovery().getGroups();
        if (!groups.some((g) => g.metadata?.name === 'metrics.k8s.io')) {
          return 'Not supported by cluster';
        }
        return undefined;
      }, undefined, { lazy: true }) },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/DebugInfo.vue'),
      meta: { name: 'About' },
    },
    // hidden
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { name: 'Home', hidden: true },
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
