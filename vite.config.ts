import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const KUBECTL_PROXY = 'http://127.0.0.1:8001';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    target: 'es2022',
  },
  server: {
    proxy: {
      '/openapi': KUBECTL_PROXY,
      '/api': KUBECTL_PROXY,
      '/apis': KUBECTL_PROXY,
    },
  },
})
