import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const KUBECTL_PROXY = 'http://127.0.0.1:8001';

const getVersion = () => execSync('git describe --always --dirty').toString().trimEnd();

let version = getVersion();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'app-version',
      handleHotUpdate: ({ server }) => {
        const v = getVersion();
        if (version !== v) {
          version = v;
          // XXX: hackish
          server.restart();
        }
      },
      transform: (code) => ({
        code: code.replace(/__version_placeholder__/g, version),
        map: null,
      }),
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
  },
  server: {
    proxy: {
      '/openapi': KUBECTL_PROXY,
      '/api': {
        target: KUBECTL_PROXY,
        ws: true,
      },
      '/apis': KUBECTL_PROXY,
      '/version': KUBECTL_PROXY,
    },
  },
});
