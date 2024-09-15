/// <reference types="vite/client" />

declare module '*.md' {
  // "unknown" would be more detailed depends on how you structure frontmatter
  const attributes: Record<string, unknown>;

  // When "Mode.TOC" is requested
  const toc: { level: string, content: string }[];

  // When "Mode.HTML" is requested
  const html: string;

  // When "Mode.RAW" is requested
  const raw: string

  // When "Mode.Vue" is requested
  import { ComponentOptions, Component } from 'vue';
  const VueComponent: ComponentOptions;
  const VueComponentWith: (components: Record<string, Component>) => ComponentOptions;

  // Modify below per your usage
  export { VueComponent, VueComponentWith };
}

interface ImportMetaEnv {
  readonly VITE_KUBERNETES_API: string,
  readonly VITE_AUTH_METHOD: 'oidc' | 'access_token' | 'none',
  readonly VITE_RUNTIME_AUTH_CONFIG: 'true' | 'false',
  readonly VITE_OIDC_PROVIDER: string,
  readonly VITE_OIDC_CLIENT_ID: string,
  readonly VITE_OIDC_CLIENT_SECRET: string,
  readonly VITE_OIDC_SCOPES: string, // space seperated list
}

interface ImportMeta {
  readonly env: ImportMetaEnv,
}
