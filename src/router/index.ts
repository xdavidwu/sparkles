import { createRouter, createWebHistory } from 'vue-router';
import { computedAsync } from '@vueuse/core';
import HomeView from '@/views/HomeView.vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
  ]
});

export default router;
