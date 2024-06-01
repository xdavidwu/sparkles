import {
  AuthenticationV1Api, AuthenticationV1beta1Api,
  V1StatusFromJSON,
  type V1SelfSubjectReview,
  Configuration, FetchError, ResponseError,
  type InitOverrideFunction, type HTTPRequestInit, type HTTPHeaders, type RequestContext, type Middleware,
} from '@/kubernetes-api/src';

export type ChainableInitOverrideFunction = (...p: Parameters<InitOverrideFunction>) =>
  (Promise<Awaited<ReturnType<InitOverrideFunction>> & HTTPRequestInit & { headers: HTTPHeaders }>);

export const asYAML: ChainableInitOverrideFunction = async (context) => {
  const overridden = {
    ...context.init,
    headers: context.init.headers ?? {},
  };
  overridden.headers['accept'] = 'application/yaml';
  return overridden;
};

export const fromYAML: ChainableInitOverrideFunction = async (context) => {
  const overridden = {
    ...context.init,
    headers: context.init.headers ?? {},
  };
  overridden.headers['Content-Type'] = 'application/yaml';
  return overridden;
};

const identityOverrideFn: InitOverrideFunction = async ({ init }) => init;

export const chainOverrideFunction = (
  a: ChainableInitOverrideFunction,
  b?: RequestInit | InitOverrideFunction,
): InitOverrideFunction =>
  async (c) => {
    const fn = b === undefined ? identityOverrideFn : (
      typeof b === 'function' ? b : async () => b);
    return await fn({ init: await a(c), context: c.context });
  };

export class ExtractedRequestContext {
  constructor(public context: RequestContext) {}
}

export const extractRequestContext: Middleware['pre'] = (context) => {
  throw new ExtractedRequestContext(context);
}

export const errorIsResourceNotFound = async (err: any) => {
  if (err instanceof ResponseError && err.response.status === 404) {
    const status = V1StatusFromJSON(await err.response.json());
    if (status.status === 'Failure' && status.reason === 'NotFound') {
      return true;
    }
  }
  return false;
}

export const errorIsTypeUnsupported = async (err: any) => {
  if (err instanceof ResponseError && err.response.status === 404) {
    const status = V1StatusFromJSON(await err.response.json());
    if (status.status === 'Failure' && status.reason === 'NotFound' &&
        status.message === 'the server could not find the requested resource') {
      return true;
    }
  }
  return false;
}

export const rawErrorIsAborted = (err: any) =>
  err instanceof DOMException && err.name === 'AbortError';

export const errorIsAborted = (err: any) =>
  err instanceof FetchError && rawErrorIsAborted(err.cause);

// v1beta1 and v1 SelfSubjectReview is actually the same
export const doSelfSubjectReview = async (config: Configuration): Promise<V1SelfSubjectReview> => {
  const v1Api = new AuthenticationV1Api(config);
  try {
    return await v1Api.createSelfSubjectReview({ body: {} });
  } catch (err) {
    if (await errorIsTypeUnsupported(err)) {
      const v1beta1Api = new AuthenticationV1beta1Api(config);
      return await v1beta1Api.createSelfSubjectReview({ body: {} });
    } else {
      throw err;
    }
  }
}
