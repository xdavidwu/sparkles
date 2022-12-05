import {
  CoreV1Api,
  CustomObjectsApi,
  type CustomObjectsApiGetAPIResourcesRequest,
  type CustomObjectsApiGetClusterCustomObjectRequest,
  type CustomObjectsApiGetNamespacedCustomObjectRequest,
  type CustomObjectsApiListClusterCustomObjectRequest,
  type CustomObjectsApiListNamespacedCustomObjectRequest,
  type V1APIResourceList,
  type Middleware,
} from '@/kubernetes-api/src';

export interface AnyApiGetAPIResourcesRequest
      extends Omit<CustomObjectsApiGetAPIResourcesRequest, 'group'> {
    group?: string;
}

export interface AnyApiGetClusterCustomObjectRequest
      extends Omit<CustomObjectsApiGetClusterCustomObjectRequest, 'group'> {
    group?: string;
}

export interface AnyApiGetNamespacedCustomObjectRequest
      extends Omit<CustomObjectsApiGetNamespacedCustomObjectRequest, 'group'> {
    group?: string;
}

export interface AnyApiListClusterCustomObjectRequest
      extends Omit<CustomObjectsApiListClusterCustomObjectRequest, 'group'> {
    group?: string;
}

export interface AnyApiListNamespacedCustomObjectRequest
      extends Omit<CustomObjectsApiListNamespacedCustomObjectRequest, 'group'> {
    group?: string;
}

const toCore: Middleware['pre'] = async (context) => ({
  ...context,
  url: context.url.replace('apis/core', 'api'),
});

export class AnyApi extends CustomObjectsApi {

  async getAPIResources(requestParameters: AnyApiGetAPIResourcesRequest): Promise<V1APIResourceList> {
    if (requestParameters.group) {
      return super.getAPIResources({ group: requestParameters.group!, version: requestParameters.version });
    } else {
      return new CoreV1Api(this.configuration).getAPIResources();
    }
  }

  // TODO: type this
  async listClusterCustomObjectAsTable(requestParameters: AnyApiListClusterCustomObjectRequest):
      Promise<object> {
    const asTable: Middleware['pre'] = async (context) => {
      context.init.headers = {
        ...context.init.headers,
        accept: 'application/json;as=Table;g=meta.k8s.io;v=v1',
      };
      return context;
    };
    if (requestParameters.group) {
      return super.withPreMiddleware(asTable)
        .listClusterCustomObject({ ...requestParameters, group: requestParameters.group! });
    } else {
      return super.withPreMiddleware(toCore, asTable)
        .listClusterCustomObject({ ...requestParameters, group: 'core' });
    }
  }

  async listNamespacedCustomObjectAsTable(requestParameters: AnyApiListNamespacedCustomObjectRequest):
      Promise<object> {
    const asTable: Middleware['pre'] = async (context) => {
      context.init.headers = {
        ...context.init.headers,
        accept: 'application/json;as=Table;g=meta.k8s.io;v=v1',
      };
      return context;
    };
    if (requestParameters.group) {
      return super.withPreMiddleware(asTable)
        .listNamespacedCustomObject({ ...requestParameters, group: requestParameters.group! });
    } else {
      return super.withPreMiddleware(toCore, asTable)
        .listNamespacedCustomObject({ ...requestParameters, group: 'core' });
    }
  }

  async getClusterCustomObject(requestParameters: AnyApiGetClusterCustomObjectRequest):
      Promise<object> {
    if (requestParameters.group) {
      return super.getClusterCustomObject({ ...requestParameters, group: requestParameters.group! });
    } else {
      return super.withPreMiddleware(toCore)
        .getClusterCustomObject({ ...requestParameters, group: 'core' });
    }
  }

  async getNamespacedCustomObject(requestParameters: AnyApiGetNamespacedCustomObjectRequest):
      Promise<object> {
    if (requestParameters.group) {
      return super.getNamespacedCustomObject({ ...requestParameters, group: requestParameters.group! });
    } else {
      return super.withPreMiddleware(toCore)
        .getNamespacedCustomObject({ ...requestParameters, group: 'core' });
    }
  }
}
