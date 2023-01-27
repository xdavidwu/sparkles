import {
  CoreV1Api,
  CustomObjectsApi,
  type ApiResponse,
  type CustomObjectsApiGetAPIResourcesRequest,
  type CustomObjectsApiGetClusterCustomObjectRequest,
  type CustomObjectsApiGetNamespacedCustomObjectRequest,
  type CustomObjectsApiListClusterCustomObjectRequest,
  type CustomObjectsApiListNamespacedCustomObjectRequest,
  type V1APIResourceList,
  type V1ListMeta,
  type V1ObjectMeta,
  type HTTPHeaders,
  type Middleware,
  type InitOverrideFunction,
} from '@/kubernetes-api/src';
import type { OpenAPIV3 } from 'openapi-types';

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

export interface AnyApiGetOpenAPISchemaRequest {
  group?: string;
  version: string;
}

const toCore: Middleware['pre'] = async (context) => ({
  ...context,
  url: context.url.replace('apis/core', 'api'),
});

const asTable: Middleware['pre'] = async (context) => {
  context.init.headers = {
    ...context.init.headers,
    accept: 'application/json;as=Table;g=meta.k8s.io;v=v1',
  };
  return context;
};

// https://github.com/kubernetes/apimachinery/blob/master/pkg/apis/meta/v1/types.go

export interface V1TableColumnDefinition {
  name: string;
  type: string;
  format: string;
  description: string;
  priority: number;
}

export interface V1PartialObjectMetadata {
  apiVersion?: string;
  kind?: string;
  metadata?: V1ObjectMeta;
}

export interface V1TableRow {
  cells: Array<object>;
  conditions?: object;
  object?: V1PartialObjectMetadata | object;
}

export interface V1Table {
  apiVersion?: string;
  kind?: string;
  metadata?: V1ListMeta;
  columnDefinitions: Array<V1TableColumnDefinition>;
  rows: Array<V1TableRow>;
}

export class AnyApi extends CustomObjectsApi {

  async getAPIResources(requestParameters: AnyApiGetAPIResourcesRequest): Promise<V1APIResourceList> {
    if (requestParameters.group) {
      return super.getAPIResources({ group: requestParameters.group!, version: requestParameters.version });
    } else {
      return new CoreV1Api(this.configuration).getAPIResources();
    }
  }

  // TODO: type this
  async listClusterCustomObjectRaw(
      requestParameters: AnyApiListClusterCustomObjectRequest,
      initOverrides?: RequestInit | InitOverrideFunction
      ): Promise<ApiResponse<object>> {
    if (requestParameters.group) {
      return super.listClusterCustomObjectRaw({
        ...requestParameters,
        group: requestParameters.group!,
      }, initOverrides);
    } else {
      return super.withPreMiddleware(toCore)
        .listClusterCustomObjectRaw({
          ...requestParameters,
          group: 'core',
        }, initOverrides);
    }
  }

  async listNamespacedCustomObjectRaw(
      requestParameters: AnyApiListNamespacedCustomObjectRequest,
      initOverrides?: RequestInit | InitOverrideFunction
      ): Promise<ApiResponse<object>> {
    if (requestParameters.group) {
      return super.listNamespacedCustomObjectRaw({
        ...requestParameters,
        group: requestParameters.group!,
      }, initOverrides);
    } else {
      return super.withPreMiddleware(toCore)
        .listNamespacedCustomObjectRaw({
          ...requestParameters,
          group: 'core',
        }, initOverrides);
    }
  }

  async listClusterCustomObject(
      requestParameters: AnyApiListClusterCustomObjectRequest,
      initOverrides?: RequestInit | InitOverrideFunction
      ): Promise<object> {
    const response = await this.listClusterCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async listNamespacedCustomObject(
      requestParameters: AnyApiListNamespacedCustomObjectRequest,
      initOverrides?: RequestInit | InitOverrideFunction
      ): Promise<object> {
    const response = await this.listNamespacedCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async listClusterCustomObjectAsTableRaw(
      requestParameters: AnyApiListClusterCustomObjectRequest,
      initOverrides?: RequestInit
      ): Promise<ApiResponse<V1Table>> {
    return <ApiResponse<V1Table>> await this.withPreMiddleware(asTable)
      .listClusterCustomObjectRaw(requestParameters, initOverrides);
  }

  async listNamespacedCustomObjectAsTableRaw(
      requestParameters: AnyApiListNamespacedCustomObjectRequest,
      initOverrides?: RequestInit
      ): Promise<ApiResponse<V1Table>> {
    return <ApiResponse<V1Table>> await this.withPreMiddleware(asTable)
      .listNamespacedCustomObjectRaw(requestParameters, initOverrides);
  }

  async listClusterCustomObjectAsTable(
      requestParameters: AnyApiListClusterCustomObjectRequest,
      initOverrides?: RequestInit
      ): Promise<V1Table> {
    const response = await this.listClusterCustomObjectAsTableRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async listNamespacedCustomObjectAsTable(
        requestParameters: AnyApiListNamespacedCustomObjectRequest,
        initOverrides?: RequestInit
        ): Promise<V1Table> {
    const response = await this.listNamespacedCustomObjectAsTableRaw(requestParameters, initOverrides);
    return await response.value();
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

  async getOpenAPISchema(requestParameters: AnyApiGetOpenAPISchemaRequest):
      Promise<OpenAPIV3.Document> {
    const url = requestParameters.group ?
      `/openapi/v3/apis/${requestParameters.group}/${requestParameters.version}`:
      `/openapi/v3/api/${requestParameters.version}`;

    const headerParameters: HTTPHeaders = {};

    if (this.configuration && this.configuration.apiKey) {
        headerParameters["authorization"] = this.configuration.apiKey("authorization"); // BearerToken authentication
    }

    const response = await this.request({
      path: url,
      method: 'GET',
      headers: headerParameters,
    });

    return response.json();
  }
}
