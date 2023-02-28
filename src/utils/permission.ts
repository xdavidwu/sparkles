import { useApiConfig } from '@/stores/apiConfig';
import { AuthorizationV1Api, type V1ResourceAttributes } from '@/kubernetes-api/src';

export enum PermissionStatus {
  Allowed = "allowed",
  Denied = "denied",
  Unknown = "unknown",
}

export const checkPermission = async (operation: V1ResourceAttributes): Promise<PermissionStatus> => {
  const apiConfig = useApiConfig();
  const response = await (new AuthorizationV1Api(await apiConfig.getConfig())).createSelfSubjectAccessReview({
    body: {
      spec: {
        resourceAttributes: operation,
      },
    },
  });
  return response.status?.allowed ? PermissionStatus.Allowed :
      response.status?.denied ? PermissionStatus.Denied : PermissionStatus.Unknown;
}
