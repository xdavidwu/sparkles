import { V1StatusFromJSON, ResponseError } from '@/kubernetes-api/src';

export const errorIsApiUnsupported = async (err: any) => {
  if (err instanceof ResponseError && err.response.status === 404) {
    const status = V1StatusFromJSON(JSON.parse(await err.response.text()));
    if (status.status === 'Failure' && status.reason === 'NotFound') {
      return true;
    }
  }
  return false;
}

