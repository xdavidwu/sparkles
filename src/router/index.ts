import type { Ref } from 'vue';
import { storeToRefs } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { computedAsync } from '@vueuse/core';
import HomeView from '@/views/HomeView.vue';
import NotFound from '@/views/NotFound.vue';
import { useApisDiscovery } from '@/stores/apisDiscovery';
import { useNamespaces } from '@/stores/namespaces';
import { usePermissions } from '@/stores/permissions';
import { brand } from '@/utils/config';

declare global {
  interface Window {
    __base_url: string;
  }
}

export const Category = {
  NAMESPACED: 'Namespaced',
  CLUSTER: 'Cluster',
  // XXX this (not a const expression) make it hard to use as ts enum
  APP: brand,
  HIDDEN: 'Hidden',
};

declare module 'vue-router' {
  interface RouteMeta {
    category: (typeof Category)[keyof typeof Category],
    name: string,
    unsupported?: Ref<string | undefined>,
  }
}

type ParametersExceptFirst<T> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (f: any, ...r: infer R) => any ? R : never;

const _checkWithPermissionStore = async (
  conditions: Array<ParametersExceptFirst<ReturnType<typeof usePermissions>['mayAllows']>>,
) => {
  const { selectedNamespace } = storeToRefs(useNamespaces());
  if (selectedNamespace.value) {
      const { mayAllows, loadReview } = usePermissions();
      await loadReview(selectedNamespace.value);
      for (const condition of conditions) {
        if (!mayAllows(selectedNamespace.value, ...condition)) {
          return 'Insufficient permission';
        }
      }
  }
};

const checkWithPermissionStore = (
  conditions: Parameters<typeof _checkWithPermissionStore>[0],
) => computedAsync(() => _checkWithPermissionStore(conditions), undefined, { lazy: true });

const router = createRouter({
  history: createWebHistory(window.__base_url),
  routes: [
    // namespaced
    {
      path: '/pods',
      name: 'pods',
      component: () => import('@/views/PodsList.vue'),
      meta: { name: 'Pods', category: Category.NAMESPACED,
        unsupported: checkWithPermissionStore([['', 'pods', '*', 'list']]) },
    },
    {
      path: '/helm',
      name: 'helm',
      component: () => import('@/views/HelmList.vue'),
      meta: { name: 'Helm', category: Category.NAMESPACED,
        unsupported: checkWithPermissionStore([['', 'secrets', '*', 'list']]) }
    },
    {
      path: '/quotas',
      name: 'quotas',
      component: () => import('@/views/QuotasUsage.vue'),
      meta: {
        name: 'Quotas', category: Category.NAMESPACED,
        unsupported: checkWithPermissionStore([
          ['', 'resourcequotas', '*', 'list'],
          ['', 'pods', '*', 'list'],
          ['', 'persistentvolumeclaims', '*', 'list'],
        ]),
      },
    },
    {
      path: '/tokens',
      name: 'tokens',
      component: () => import('@/views/SATokens.vue'),
      meta: {
        name: 'Tokens', category: Category.NAMESPACED,
        unsupported: checkWithPermissionStore([
          ['', 'serviceaccounts', '*', 'create'],
          ['', 'rolebindings', '*', 'create'],
          ['', 'secrets', '*', 'list'],
          ['', 'secrets', '*', 'create'],
          ['', 'secrets', '*', 'delete'],
        ]),
      },
    },
    {
      path: '/explore',
      name: 'explore',
      component: () => import('@/views/ResourceExplorer.vue'),
      meta: { name: 'Resource Explorer', category: Category.NAMESPACED },
    },
    {
      path: '/kubectl',
      name: 'kubectl',
      component: () => import('@/views/KubectlTerminal.vue'),
      meta: {
        name: 'kubectl', category: Category.NAMESPACED,
        unsupported: checkWithPermissionStore([
          ['', 'serviceaccounts', '*', 'create'],
          ['', 'rolebindings', '*', 'create'],
          ['', 'pods', '*', 'create'],
          ['', 'pods', '*', 'delete'],
        ]),
      },
    },
    // cluster
    {
      path: '/metrics',
      name: 'metrics',
      component: () => import('@/views/NodesMetrics.vue'),
      meta: { name: 'Nodes Metrics', category: Category.CLUSTER, unsupported: computedAsync(async () => {
        const groups = await useApisDiscovery().getGroups();
        if (!groups.some((g) => g.metadata?.name === 'metrics.k8s.io')) {
          return 'Not supported by cluster';
        }
        return await _checkWithPermissionStore([['metrics.k8s.io', 'nodes', '*', 'list']]);
      }, undefined, { lazy: true }) },
    },
    // app
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/DebugInfo.vue'),
      meta: { name: 'About', category: Category.APP },
    },
    {
      path: '/docs',
      name: 'docs',
      component: () => import('@/views/DocsView.vue'),
      meta: { name: 'Documentation', category: Category.APP },
    },
    // hidden
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { name: 'Home', category: Category.HIDDEN },
    },
    {
      path: '/:_(.*)',
      component: NotFound,
      meta: { name: 'Not Found', category: Category.HIDDEN },
    },
    // handled @ @/OIDCApp.vue, should not be rendered by router
    {
      path: '/oidc/callback',
      name: 'oidc_callback',
      component: () => { throw new Error('unexpected OIDC route visit, misconfiguration?'); },
      meta: { name: 'OIDC Callback', category: Category.HIDDEN },
    },
    {
      path: '/oidc/logout',
      name: 'oidc_logout',
      component: () => { throw new Error('unexpected OIDC route visit, misconfiguration?'); },
      meta: { name: 'OIDC Logout', category: Category.HIDDEN },
    },
  ]
});

export default router;
