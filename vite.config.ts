import { fileURLToPath, URL } from 'node:url';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const KUBECTL_PROXY = 'http://127.0.0.1:8001';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // fills for swagger-parser
      util: 'rollup-plugin-node-polyfills/polyfills/util',
      url: 'rollup-plugin-node-polyfills/polyfills/url',
    },
  },
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    // fills for swagger-parser
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [NodeGlobalsPolyfillPlugin({ buffer: true, process: true }),],
    },
  },
  server: {
    proxy: {
      '/openapi': KUBECTL_PROXY,
      '/api': KUBECTL_PROXY,
      '/apis': KUBECTL_PROXY,
    },
  },
});
