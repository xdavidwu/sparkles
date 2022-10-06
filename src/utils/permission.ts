import { useApiConfig } from '@/stores/apiConfig';
import { AuthorizationV1Api } from '@/kubernetes-api/src';

export enum PermissionStatus {
  Allowed = "allowed",
  Denied = "denied",
  Unknown = "unknown",
}

export const checkPermission = async (resource: string, verb: string): Promise<PermissionStatus> => {
  const apiConfig = useApiConfig();
  const response = await (new AuthorizationV1Api(await apiConfig.getConfig())).createSelfSubjectAccessReview({
    body: {
      spec: {
        resourceAttributes: {
          resource, verb
        },
      },
    },
  });
  return response.status?.allowed ? PermissionStatus.Allowed :
      response.status?.denied ? PermissionStatus.Denied : PermissionStatus.Unknown;
}
