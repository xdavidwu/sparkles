/// <reference types="vite/client" />

import type { AuthScheme } from '@/stores/apiConfig';

interface ImportMetaEnv {
  readonly VITE_KUBERNETES_API: string,
  readonly VITE_AUTH_METHOD: AuthScheme,
  readonly VITE_RUNTIME_AUTH_CONFIG: string, // true/false
  readonly VITE_OIDC_PROVIDER: string,
  readonly VITE_OIDC_CLIENT_ID: string,
  readonly VITE_OIDC_CLIENT_SECRET: string,
  readonly VITE_OIDC_SCOPES: string,
}

interface ImportMeta {
  readonly env: ImportMetaEnv,
}
