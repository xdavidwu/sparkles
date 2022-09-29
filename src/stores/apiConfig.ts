import { defineStore } from 'pinia';
import { Configuration, type HTTPHeaders } from '@/kubernetes-api/src';
import { useLocalStorage } from '@vueuse/core';
import type { RemovableRef } from '@vueuse/shared';
import { UserManager } from 'oidc-client-ts';
import { useRouter } from 'vue-router';

export enum AuthScheme {
  OIDC,
  AccessToken,
  None,
}

interface State {
  authScheme: RemovableRef<AuthScheme>,
  accessToken: RemovableRef<string>,
  userManager: UserManager,
}

export const useApiConfig = defineStore('api-config', {
  state(): State {
    const manager = new UserManager({
      authority: import.meta.env.VITE_OIDC_PROVIDER,
      client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
      client_secret: import.meta.env.VITE_OIDC_CLIENT_SECRET,
      redirect_uri: window.location.origin + useRouter().resolve({name: 'oidc_callback'}).href,
      scope: import.meta.env.VITE_OIDC_SCOPES,
    });

    return {
      authScheme: useLocalStorage<AuthScheme>('auth-scheme', AuthScheme.None),
      accessToken: useLocalStorage('access-token', ''),
      userManager: manager,
    };
  },
  actions: {
    setAccessToken(token: string) {
      this.accessToken = token;
    },
    getAccessToken() {
      return this.accessToken;
    },
    setAuthScheme(scheme: AuthScheme) {
      this.authScheme = scheme;
    },
    getAuthScheme() {
      return this.authScheme;
    },
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
          }
          headers['Authorization'] = `Bearer ${user?.id_token}`;
      }
      return new Configuration({ basePath: import.meta.env.VITE_KUBERNETES_API, headers });
    },
  },
});
