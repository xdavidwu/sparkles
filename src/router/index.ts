import { createRouter, createWebHistory } from 'vue-router';
import AboutView from '@/views/AboutView.vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { computed } from 'vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: AboutView,
      meta: { name: 'Home' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/APISettings.vue'),
      meta: { name: 'Settings' },
    },
    {
      path: '/oidc/callback',
      name: 'oidc_callback',
      component: () => import('@/views/OIDCCallback.vue'),
      meta: { name: 'OIDC Auth', hidden: true },
    },
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
      meta: { name: 'Nodes Metrics', unsupported: computed(() => {
        if (!useApisDiscovery().groups.find((g) => g.name === 'metrics.k8s.io')) {
          return 'Metrics not supported by cluster';
        }
        return undefined;
      }) },
    },
    {
      path: '/quotas',
      name: 'quotas',
      component: () => import('@/views/QuotasUsage.vue'),
      meta: { name: 'Quotas', namespaced: true },
    },
    {
      path: '/pods',
      name: 'pods',
      component: () => import('@/views/PodsList.vue'),
      meta: { name: 'Pods', namespaced: true },
    },
    {
      path: '/helm',
      name: 'helm',
      component: () => import('@/views/HelmList.vue'),
      meta: { name: 'Helm', namespaced: true },
    },
  ]
});

export default router;
