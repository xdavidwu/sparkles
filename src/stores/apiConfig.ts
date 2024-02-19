import { defineStore } from 'pinia';
import { Configuration, type HTTPHeaders } from '@/kubernetes-api/src';
import { useLocalStorage } from '@vueuse/core';
import { computed, type Ref } from 'vue';
import { UserManager } from 'oidc-client-ts';
import router from '@/router';

export enum AuthScheme {
  OIDC = 'oidc',
  AccessToken = 'aceess_token',
  None = 'none',
}

// XXX: fetch and openapi-generator/typescript-fetch does not seems to support
// headers with same name but different values, and kubernetes does not support
// comma-seperated list yet (82468)
interface ImpersonationConfig {
  asUser: string,
  asGroup: string,
}

interface State {
  authScheme: Ref<AuthScheme>,
  accessToken: Ref<string>,
  impersonation: Ref<ImpersonationConfig>,
  userManager: UserManager,
}

const maybeUseLocalStorage = <T>(key: string, initial: T) =>
  import.meta.env.VITE_RUNTIME_AUTH_CONFIG === 'true' ?
  useLocalStorage<T>(key, initial) : computed<T>({
    get: () => initial,
    set: () => {throw new Error(`unexpected setting of ${key}`)},
  });

export const useApiConfig = defineStore('api-config', {
  state: (): State => ({
    authScheme: maybeUseLocalStorage<AuthScheme>('auth-scheme', import.meta.env.VITE_AUTH_METHOD),
    accessToken: maybeUseLocalStorage('access-token', ''),
    impersonation: maybeUseLocalStorage('impersonation', { asUser: '', asGroup: '' }),
    userManager: new UserManager({
      authority: import.meta.env.VITE_OIDC_PROVIDER,
      client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
      client_secret: import.meta.env.VITE_OIDC_CLIENT_SECRET,
      redirect_uri: window.location.origin + router.resolve('/oidc/callback').href,
      scope: import.meta.env.VITE_OIDC_SCOPES,
    }),
  }),
  actions: {
    async getBearerToken() {
      let user;
      switch (this.authScheme) {
        case AuthScheme.AccessToken:
          return this.accessToken;
        case AuthScheme.OIDC:
          user = await this.userManager.getUser();
          if (user === null) {
            await this.userManager.signinRedirect({ state: window.location.pathname });
            throw new Error('OIDC redirect failed');
          } else {
            return user.id_token;
          }
      }
      return null;
    },
    async getConfig() {
      const headers: HTTPHeaders = {};

      const token = await this.getBearerToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      if (this.impersonation.asUser) {
        headers['Impersonate-User'] = this.impersonation.asUser;
        if (this.impersonation.asGroup) {
          headers['Impersonate-Group'] = this.impersonation.asGroup;
        }
      }

      return new Configuration({ basePath: import.meta.env.VITE_KUBERNETES_API, headers });
    },
  },
  getters: {
    fullApiBasePath() {
      return import.meta.env.VITE_KUBERNETES_API === '' ?
        document.location.origin : import.meta.env.VITE_KUBERNETES_API;
    },
  },
});
