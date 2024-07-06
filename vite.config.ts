import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const KUBECTL_PROXY = 'http://127.0.0.1:8001';

const getVersion = () => execSync('git describe --always --dirty').toString().trimEnd();

let version = getVersion();

const modulesWithVersions = new Map();

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
          [...modulesWithVersions.keys()].forEach((id) => {
            const module = server.moduleGraph.idToModuleMap.get(id);
            if (module) {
              server.reloadModule(module);
            } else {
              modulesWithVersions.delete(id);
            }
          });
        }
      },
      transform: (code, id) => ({
        code: code.replace(/__version_placeholder__/g, () => {
          modulesWithVersions.set(id, null);
          return version;
        }),
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
    reportCompressedSize: false,
  },
  experimental: {
    renderBuiltUrl: (filename: string, { hostType }: { hostType: 'js' | 'css' | 'html' }) => {
      if (hostType === 'js') {
        return { runtime: `window.__base_url + ${JSON.stringify(filename)}` };
      } else {
        return { relative: true };
      }
    },
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
