import {
  CoreV1Api,
  CustomObjectsApi,
  type ApiResponse,
  type CustomObjectsApiDeleteClusterCustomObjectRequest,
  type CustomObjectsApiDeleteNamespacedCustomObjectRequest,
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
import type { KubernetesObject } from '@/utils/objects';

type PartiallyRequired<T, C extends keyof T> = Omit<T, C> & Partial<Pick<T, C>>;

export type AnyApiGetAPIResourcesRequest =
  PartiallyRequired<CustomObjectsApiGetAPIResourcesRequest, 'group'>;

export type AnyApiGetClusterCustomObjectRequest =
  PartiallyRequired<CustomObjectsApiGetClusterCustomObjectRequest, 'group'>;

export type AnyApiGetNamespacedCustomObjectRequest =
  PartiallyRequired<CustomObjectsApiGetNamespacedCustomObjectRequest, 'group'>;

export type AnyApiListClusterCustomObjectRequest =
  PartiallyRequired<CustomObjectsApiListClusterCustomObjectRequest, 'group'>;

export type AnyApiListNamespacedCustomObjectRequest =
  PartiallyRequired<CustomObjectsApiListNamespacedCustomObjectRequest, 'group'>;

export type AnyApiDeleteClusterCustomObjectRequest =
  PartiallyRequired<CustomObjectsApiDeleteClusterCustomObjectRequest, 'group'>;

export type AnyApiDeleteNamespacedCustomObjectRequest =
  PartiallyRequired<CustomObjectsApiDeleteNamespacedCustomObjectRequest, 'group'>;

export interface AnyApiGetOpenAPISchemaRequest {
  group?: string;
  version: string;
}

const corePlaceholder = '~core~';

const toCore: Middleware['pre'] = async (context) => ({
  ...context,
  url: context.url.replace(`apis/${corePlaceholder}`, 'api'),
});

const asTable: Middleware['pre'] = async (context) => {
  context.init.headers = {
    ...context.init.headers,
    accept: 'application/json;as=Table;g=meta.k8s.io;v=v1',
  };
  return context;
};

export const asYAML: Middleware['pre'] = async (context) => {
  context.init.headers = {
    ...context.init.headers,
    accept: 'application/yaml',
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

export interface V1TableRow<
  ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
> {
  cells: Array<string>;
  conditions?: object;
  object: ObjectType;
}

export interface V1Table<
  ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
> {
  apiVersion?: string;
  kind?: string;
  metadata?: V1ListMeta;
  columnDefinitions: Array<V1TableColumnDefinition>;
  rows?: Array<V1TableRow<ObjectType>>;
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
          group: corePlaceholder,
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
          group: corePlaceholder,
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

  async listClusterCustomObjectAsTableRaw<
      ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
    >(
      requestParameters: AnyApiListClusterCustomObjectRequest,
      initOverrides?: RequestInit
      ): Promise<ApiResponse<V1Table<ObjectType>>> {
    return <ApiResponse<V1Table<ObjectType>>> await this.withPreMiddleware(asTable)
      .listClusterCustomObjectRaw(requestParameters, initOverrides);
  }

  async listNamespacedCustomObjectAsTableRaw<
      ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
    >(
      requestParameters: AnyApiListNamespacedCustomObjectRequest,
      initOverrides?: RequestInit
      ): Promise<ApiResponse<V1Table<ObjectType>>> {
    return <ApiResponse<V1Table<ObjectType>>> await this.withPreMiddleware(asTable)
      .listNamespacedCustomObjectRaw(requestParameters, initOverrides);
  }

  async listClusterCustomObjectAsTable<
      ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
    >(
      requestParameters: AnyApiListClusterCustomObjectRequest,
      initOverrides?: RequestInit
      ): Promise<V1Table<ObjectType>> {
    const response = await this.listClusterCustomObjectAsTableRaw<ObjectType>(requestParameters, initOverrides);
    return await response.value();
  }

  async listNamespacedCustomObjectAsTable<
      ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
    >(
        requestParameters: AnyApiListNamespacedCustomObjectRequest,
        initOverrides?: RequestInit
        ): Promise<V1Table<ObjectType>> {
    const response = await this.listNamespacedCustomObjectAsTableRaw<ObjectType>(requestParameters, initOverrides);
    return await response.value();
  }

  async getClusterCustomObjectRaw(
      requestParameters: AnyApiGetClusterCustomObjectRequest,
      initOverrides?: RequestInit,
  ): Promise<ApiResponse<object>> {
    if (requestParameters.group) {
      return super.getClusterCustomObjectRaw(
        { ...requestParameters, group: requestParameters.group! },
        initOverrides,
      );
    } else {
      return super.withPreMiddleware(toCore)
        .getClusterCustomObjectRaw(
          { ...requestParameters, group: corePlaceholder },
          initOverrides,
        );
    }
  }

  async getNamespacedCustomObjectRaw(
      requestParameters: AnyApiGetNamespacedCustomObjectRequest,
      initOverrides?: RequestInit,
  ): Promise<ApiResponse<object>> {
    if (requestParameters.group) {
      return super.getNamespacedCustomObjectRaw(
        { ...requestParameters, group: requestParameters.group! },
        initOverrides,
      );
    } else {
      return super.withPreMiddleware(toCore)
        .getNamespacedCustomObjectRaw(
          { ...requestParameters, group: corePlaceholder },
          initOverrides,
        );
    }
  }

  async deleteClusterCustomObjectRaw(
      requestParameters: AnyApiDeleteClusterCustomObjectRequest,
      initOverrides?: RequestInit | InitOverrideFunction
      ): Promise<ApiResponse<object>> {
    if (requestParameters.group) {
      return super.deleteClusterCustomObjectRaw({
        ...requestParameters,
        group: requestParameters.group!,
      }, initOverrides);
    } else {
      return super.withPreMiddleware(toCore)
        .deleteClusterCustomObjectRaw({
          ...requestParameters,
          group: corePlaceholder,
        }, initOverrides);
    }
  }

  async deleteNamespacedCustomObjectRaw(
      requestParameters: AnyApiDeleteNamespacedCustomObjectRequest,
      initOverrides?: RequestInit | InitOverrideFunction
      ): Promise<ApiResponse<object>> {
    if (requestParameters.group) {
      return super.deleteNamespacedCustomObjectRaw({
        ...requestParameters,
        group: requestParameters.group!,
      }, initOverrides);
    } else {
      return super.withPreMiddleware(toCore)
        .deleteNamespacedCustomObjectRaw({
          ...requestParameters,
          group: corePlaceholder,
        }, initOverrides);
    }
  }

  async deleteClusterCustomObject(
      requestParameters: AnyApiDeleteClusterCustomObjectRequest,
      initOverrides?: RequestInit | InitOverrideFunction
      ): Promise<object> {
    const response = await this.deleteClusterCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async deleteNamespacedCustomObject(
      requestParameters: AnyApiDeleteNamespacedCustomObjectRequest,
      initOverrides?: RequestInit | InitOverrideFunction
      ): Promise<object> {
    const response = await this.deleteNamespacedCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
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
