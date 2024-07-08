import { defineStore } from 'pinia';
import {
  Configuration,
  type ConfigurationParameters, type HTTPHeaders, type Middleware,
} from '@xdavidwu/kubernetes-client-typescript-fetch';
import { useLocalStorage } from '@vueuse/core';
import { computed } from 'vue';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import router from '@/router';
import { useErrorPresentation } from '@/stores/errorPresentation';
import { setFieldManager } from '@/utils/api';

export enum AuthScheme {
  OIDC = 'oidc',
  AccessToken = 'aceess_token',
  None = 'none',
}

const toastWarnings = (fullApiBasePath: string): Middleware['post'] => async ({ url, response }) => {
  if (response.headers.has('Warning')) {
    const v = response.headers.get('Warning')!;
    console.log(`Kubernetes API Warning: ${url}: ${v}`);

    // warn-code SP warn-agent SP warn-text [SP warn-date], ...

    // k8s.io/apiserver/pkg/endpoints.filters/recorder.AddWaring
    // warn-code is always 299
    // warn-agent is settable, but no one use it yet, thus always -
    // warn-date is not used
    let rest = v.trim();
    const errorOut = (msg: string) => {
      throw new Error(`Invalid warning header: ${msg}: ${v}`);
    }
    const msgs = [];
    while (rest.length) {
      const agentTextDateRest = rest.substring(4);
      const textDateRest = agentTextDateRest.substring(agentTextDateRest.indexOf(' ') + 1);
      if (textDateRest[0] != '"') {
        errorOut('Expected quoted-string');
      }

      let msg = '';
      let escaped = false;
      let i = 1;
      for (;; i++) {
        if (i >= textDateRest.length) {
          errorOut('Unclosed quoted-string');
        }
        if (escaped) {
          msg += textDateRest[i];
          escaped = false;
        } else if (textDateRest[i] == '"') {
          break
        } else {
          escaped = textDateRest[i] == '\\';
          if (!escaped) {
            msg += textDateRest[i];
          }
        }
      }
      msgs.push(msg);
      i++;
      if (i >= textDateRest.length) {
        break;
      }

      if (textDateRest[i] == ',') {
        rest = textDateRest.substring(i + 1).trimStart();
      } else {
        errorOut('warn-date is not supported' + textDateRest[i]);
      }
    }

    const normalizedUrl = response.url.replace(
      fullApiBasePath.endsWith('/')
      ? fullApiBasePath.substring(0, fullApiBasePath.length - 1)
      : fullApiBasePath, '');

    useErrorPresentation().pendingToast = `Kubernetes returned warning at ${normalizedUrl}:\n${msgs.join('\n')}`;
  }
};

export const useApiConfig = defineStore('api-config', () => {
  const configurable = import.meta.env.VITE_RUNTIME_AUTH_CONFIG === 'true';
  const fullApiBasePath = (new URL(import.meta.env.VITE_KUBERNETES_API, document.location.origin)).href;
  const userManager = new UserManager({
    authority: import.meta.env.VITE_OIDC_PROVIDER,
    client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
    client_secret: import.meta.env.VITE_OIDC_CLIENT_SECRET,
    redirect_uri: window.location.origin + router.resolve('/oidc/callback').href,
    scope: import.meta.env.VITE_OIDC_SCOPES,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });

  const maybeUseLocalStorage = <T>(key: string, initial: T) => configurable ?
    useLocalStorage<T>(key, initial) : computed<T>({
      get: () => initial,
      set: () => {throw new Error(`unexpected setting of ${key}`)},
    });
  const authScheme = maybeUseLocalStorage<AuthScheme>('auth-scheme', import.meta.env.VITE_AUTH_METHOD);
  const accessToken = maybeUseLocalStorage('access-token', '');
  // XXX: fetch and openapi-generator/typescript-fetch does not seems to support
  // headers with same name but different values, and kubernetes does not support
  // comma-seperated list yet (82468)
  const impersonation = maybeUseLocalStorage('impersonation', { asUser: '', asGroup: '' });

  const getIdToken = async () => {
    let user = await userManager.getUser();
    const idTokenExpired = () => (user?.profile.exp && new Date((user.profile.exp - 5) * 1000) < new Date());
    if ((user?.expired || idTokenExpired()) && user?.refresh_token) {
      try {
        user = await userManager.signinSilent();
      } catch (e) {
        //
      }
    }

    if (user === null || user.expired || idTokenExpired()) {
      await userManager.signinRedirect({ state: window.location.pathname });
      throw new Error('OIDC redirect failed');
    } else {
      return user.id_token;
    }
  };
  const getBearerToken = async () => {
    switch (authScheme.value) {
      case AuthScheme.AccessToken:
        return accessToken.value;
      case AuthScheme.OIDC:
        return await getIdToken();
    }
    return null;
  };
  const getCloneableConfigParams = async (): Promise<ConfigurationParameters> => {
    const headers: HTTPHeaders = {
      // avoid pretty printing, sliently dropped on chromium
      // https://crbug.com/571722
      'User-Agent': `${import.meta.env.VITE_APP_BRANDING ?? 'Sparkles'}; ${navigator.userAgent}`,
    };

    const token = await getBearerToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (impersonation.value.asUser) {
      headers['Impersonate-User'] = impersonation.value.asUser;
      if (impersonation.value.asGroup) {
        headers['Impersonate-Group'] = impersonation.value.asGroup;
      }
    }

    return {
      basePath: import.meta.env.VITE_KUBERNETES_API,
      headers,
    };
  };
  const getConfig = async () => {
    const params = await getCloneableConfigParams();

    params.middleware = [
      { pre: setFieldManager },
      { post: toastWarnings(fullApiBasePath) },
    ];
    if (authScheme.value === AuthScheme.OIDC) {
      params.middleware.push({
        pre: async (context) => {
          context.init.headers = {
            ...context.init.headers,
            Authorization: `Bearer ${await getIdToken()}`,
          };
          return context;
        },
      });
    }

    return new Configuration(params);
  };

  return {
    accessToken,
    configurable,
    fullApiBasePath,
    impersonation,
    userManager,
    authScheme,
    getBearerToken,
    getIdToken,
    getCloneableConfigParams,
    getConfig,
  };
});
