import {
  AuthenticationV1Api,
  AuthenticationV1beta1Api,
  Configuration,
  FetchError,
  ResponseError,
  type V1SelfSubjectReview,
  V1StatusFromJSON,
} from '@/kubernetes-api/src';

export const errorIsTypeUnsupported = async (err: any) => {
  if (err instanceof ResponseError && err.response.status === 404) {
    const status = V1StatusFromJSON(JSON.parse(await err.response.text()));
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
