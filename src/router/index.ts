import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'settings',
      component: HomeView
    },
    {
      path: '/about',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/AboutView.vue')
    },
    {
      path: '/oidc/callback',
      name: 'oidc_callback',
      component: () => import('../views/OIDCCallback.vue'),
    },
    {
      path: '/explore',
      name: 'explore',
      component: () => import('../views/ResourceExplorer.vue'),
    },
  ]
})

export default router
