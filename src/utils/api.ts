import { V1StatusFromJSON, ResponseError } from '@/kubernetes-api/src';

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
