import { createRouter, createWebHistory } from 'vue-router';
import AboutView from '../views/AboutView.vue';

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
      component: () => import('../views/APISettings.vue'),
      meta: { name: 'Settings' },
    },
    {
      path: '/oidc/callback',
      name: 'oidc_callback',
      component: () => import('../views/OIDCCallback.vue'),
      meta: { name: 'OIDC Auth' },
    },
    {
      path: '/explore',
      name: 'explore',
      component: () => import('../views/ResourceExplorer.vue'),
      meta: { name: 'Resource Explorer' },
    },
    {
      path: '/pods',
      name: 'pods',
      component: () => import('../views/PodsList.vue'),
      meta: { name: 'Pods' },
    },
    {
      path: '/helm',
      name: 'helm',
      component: () => import('../views/HelmList.vue'),
      meta: { name: 'Helm' },
    },
  ]
});

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.name} - ${import.meta.env.VITE_APP_BRANDING ?? 'Kubernetes SPA Client'}`;
  next();
});

export default router;
