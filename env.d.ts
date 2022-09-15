/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KUBERNETES_API: string,
}

interface ImportMeta {
  readonly env: ImportMetaEnv,
}
