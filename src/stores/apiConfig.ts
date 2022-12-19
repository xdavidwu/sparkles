import { defineStore } from 'pinia';
import { Configuration, type HTTPHeaders } from '@/kubernetes-api/src';
import { useLocalStorage } from '@vueuse/core';
import type { RemovableRef } from '@vueuse/shared';
import { UserManager } from 'oidc-client-ts';
import router from '@/router';

export enum AuthScheme {
  OIDC,
  AccessToken,
  None,
}

// XXX: fetch and openapi-generator/typescript-fetch does not seems to support
// headers with same name but different values, and kubernetes does not support
// comma-seperated list yet (82468)
interface ImpersonationConfig {
  asUser: string,
  asGroup: string,
}

interface State {
  authScheme: RemovableRef<AuthScheme>,
  accessToken: RemovableRef<string>,
  impersonation: RemovableRef<ImpersonationConfig>,
  userManager: UserManager,
}

export const useApiConfig = defineStore('api-config', {
  state: (): State => ({
    authScheme: useLocalStorage<AuthScheme>('auth-scheme', AuthScheme.None),
    accessToken: useLocalStorage('access-token', ''),
    impersonation: useLocalStorage('impersonation', { asUser: '', asGroup: '' }),
    userManager: new UserManager({
      authority: import.meta.env.VITE_OIDC_PROVIDER,
      client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
      client_secret: import.meta.env.VITE_OIDC_CLIENT_SECRET,
      redirect_uri: window.location.origin + router.resolve({name: 'oidc_callback'}).href,
      scope: import.meta.env.VITE_OIDC_SCOPES,
    }),
  }),
  actions: {
    async getConfig() {
      const headers: HTTPHeaders = {};

      let user;
      switch (this.authScheme) {
        case AuthScheme.AccessToken:
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          break;
        case AuthScheme.OIDC:
          user = await this.userManager.getUser();
          if (user === null) {
            await this.userManager.signinRedirect({ state: window.location.pathname });
            console.log('redirect failed');
          } else {
            headers['Authorization'] = `Bearer ${user.id_token}`;
          }
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
});
