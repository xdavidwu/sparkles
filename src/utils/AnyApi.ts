import {
  CustomObjectsApi,
  DefaultConfig,
  type ApiResponse,
  type CustomObjectsApiCreateClusterCustomObjectRequest,
  type CustomObjectsApiCreateNamespacedCustomObjectRequest,
  type CustomObjectsApiDeleteClusterCustomObjectRequest,
  type CustomObjectsApiDeleteNamespacedCustomObjectRequest,
  type CustomObjectsApiGetAPIResourcesRequest,
  type CustomObjectsApiGetClusterCustomObjectRequest,
  type CustomObjectsApiGetNamespacedCustomObjectRequest,
  type CustomObjectsApiListClusterCustomObjectRequest,
  type CustomObjectsApiListNamespacedCustomObjectRequest,
  type CustomObjectsApiReplaceClusterCustomObjectRequest,
  type CustomObjectsApiReplaceNamespacedCustomObjectRequest,
  type V1APIResourceList,
  type V1ListMeta,
  type V1ObjectMeta,
  type HTTPHeaders,
  type Middleware,
  type InitOverrideFunction,
} from '@/kubernetes-api/src';
import type { OpenAPIV3 } from 'openapi-types';
import type { KubernetesObject } from '@/utils/objects';
import { chainOverrideFunction, type ChainableInitOverrideFunction } from '@/utils/api';

type MakePartial<T, C extends keyof T> = Omit<T, C> & Partial<Pick<T, C>>;

export type AnyApiGetAPIResourcesRequest =
  MakePartial<CustomObjectsApiGetAPIResourcesRequest, 'group'>;

export type AnyApiGetClusterCustomObjectRequest =
  MakePartial<CustomObjectsApiGetClusterCustomObjectRequest, 'group'>;

export type AnyApiGetNamespacedCustomObjectRequest =
  MakePartial<CustomObjectsApiGetNamespacedCustomObjectRequest, 'group'>;

export type AnyApiListClusterCustomObjectRequest =
  MakePartial<CustomObjectsApiListClusterCustomObjectRequest, 'group'>;

export type AnyApiListNamespacedCustomObjectRequest =
  MakePartial<CustomObjectsApiListNamespacedCustomObjectRequest, 'group'>;

export type AnyApiDeleteClusterCustomObjectRequest =
  MakePartial<CustomObjectsApiDeleteClusterCustomObjectRequest, 'group'>;

export type AnyApiDeleteNamespacedCustomObjectRequest =
  MakePartial<CustomObjectsApiDeleteNamespacedCustomObjectRequest, 'group'>;

export type AnyApiReplaceClusterCustomObjectRequest =
  MakePartial<CustomObjectsApiReplaceClusterCustomObjectRequest, 'group'>;

export type AnyApiReplaceNamespacedCustomObjectRequest =
  MakePartial<CustomObjectsApiReplaceNamespacedCustomObjectRequest, 'group'>;

export type AnyApiCreateClusterCustomObjectRequest =
  MakePartial<CustomObjectsApiCreateClusterCustomObjectRequest, 'group'>;

export type AnyApiCreateNamespacedCustomObjectRequest =
  MakePartial<CustomObjectsApiCreateNamespacedCustomObjectRequest, 'group'>;

export interface AnyApiGetOpenAPISchemaRequest {
  group?: string;
  version: string;
}

const corePlaceholder = '~core~';

const patchCore: Middleware['pre'] = async (context) => ({
  ...context,
  url: context.url.replace(`apis/${corePlaceholder}`, 'api'),
});

const armCoreParam = <T extends { group?: string }>(p: T): T & { group: string } =>
  ({ ...p, group: p.group ?? corePlaceholder });

const asTable: ChainableInitOverrideFunction = async (context) => {
  const overridden = {
    ...context.init,
    headers: context.init.headers ?? {},
  };
  overridden.headers['accept'] = 'application/json;as=Table;g=meta.k8s.io;v=v1';
  return overridden;
};

// k8s.io/apimachinery/pkg/apis/meta/v1

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

  constructor(config = DefaultConfig) {
    // XXX this only work if middleware is specified in config (including empty array)
    config.middleware.push({ pre: patchCore });
    super(config);
  }

  async getAPIResources(requestParameters: AnyApiGetAPIResourcesRequest): Promise<V1APIResourceList> {
    return super.getAPIResources(armCoreParam(requestParameters));
  }

  async listClusterCustomObjectRaw(
    requestParameters: AnyApiListClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.listClusterCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async listNamespacedCustomObjectRaw(
    requestParameters: AnyApiListNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.listNamespacedCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async listClusterCustomObject(
    requestParameters: AnyApiListClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<object> {
    const response = await this.listClusterCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async listNamespacedCustomObject(
    requestParameters: AnyApiListNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<object> {
    const response = await this.listNamespacedCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async listClusterCustomObjectAsTableRaw<
    ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
  >(
    requestParameters: AnyApiListClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<V1Table<ObjectType>>> {
    return await this.listClusterCustomObjectRaw(
        requestParameters, chainOverrideFunction(asTable, initOverrides)) as ApiResponse<V1Table<ObjectType>>;
  }

  async listNamespacedCustomObjectAsTableRaw<
    ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
  >(
    requestParameters: AnyApiListNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<V1Table<ObjectType>>> {
    return await this.listNamespacedCustomObjectRaw(
      requestParameters, chainOverrideFunction(asTable, initOverrides)) as ApiResponse<V1Table<ObjectType>>;
  }

  async listClusterCustomObjectAsTable<
    ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
  >(
    requestParameters: AnyApiListClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<V1Table<ObjectType>> {
    const response = await this.listClusterCustomObjectAsTableRaw<ObjectType>(requestParameters, initOverrides);
    return await response.value();
  }

  async listNamespacedCustomObjectAsTable<
    ObjectType = V1PartialObjectMetadata | KubernetesObject | null,
  >(
    requestParameters: AnyApiListNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<V1Table<ObjectType>> {
    const response = await this.listNamespacedCustomObjectAsTableRaw<ObjectType>(requestParameters, initOverrides);
    return await response.value();
  }

  async getClusterCustomObjectRaw(
    requestParameters: AnyApiGetClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.getClusterCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async getNamespacedCustomObjectRaw(
    requestParameters: AnyApiGetNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.getNamespacedCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async deleteClusterCustomObjectRaw(
    requestParameters: AnyApiDeleteClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.deleteClusterCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async deleteNamespacedCustomObjectRaw(
    requestParameters: AnyApiDeleteNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.deleteNamespacedCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async deleteClusterCustomObject(
    requestParameters: AnyApiDeleteClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<object> {
    const response = await this.deleteClusterCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async deleteNamespacedCustomObject(
    requestParameters: AnyApiDeleteNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<object> {
    const response = await this.deleteNamespacedCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async replaceClusterCustomObjectRaw(
    requestParameters: AnyApiReplaceClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.replaceClusterCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async replaceNamespacedCustomObjectRaw(
    requestParameters: AnyApiReplaceNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.replaceNamespacedCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async replaceClusterCustomObject(
    requestParameters: AnyApiReplaceClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<object> {
    const response = await this.replaceClusterCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async replaceNamespacedCustomObject(
    requestParameters: AnyApiReplaceNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<object> {
    const response = await this.replaceNamespacedCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async createClusterCustomObjectRaw(
    requestParameters: AnyApiCreateClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.createClusterCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async createNamespacedCustomObjectRaw(
    requestParameters: AnyApiCreateNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<ApiResponse<object>> {
    return super.createNamespacedCustomObjectRaw(armCoreParam(requestParameters), initOverrides);
  }

  async createClusterCustomObject(
    requestParameters: AnyApiCreateClusterCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<object> {
    const response = await this.createClusterCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async createNamespacedCustomObject(
    requestParameters: AnyApiCreateNamespacedCustomObjectRequest,
    initOverrides?: RequestInit | InitOverrideFunction,
  ): Promise<object> {
    const response = await this.createNamespacedCustomObjectRaw(requestParameters, initOverrides);
    return await response.value();
  }

  async getOpenAPISchema(requestParameters: AnyApiGetOpenAPISchemaRequest):
      Promise<OpenAPIV3.Document> {
    const url = requestParameters.group ?
      `/openapi/v3/apis/${requestParameters.group}/${requestParameters.version}`:
      `/openapi/v3/api/${requestParameters.version}`;

    const headerParameters: HTTPHeaders = {};

    if (this.configuration && this.configuration.apiKey) {
      headerParameters["authorization"] = await this.configuration.apiKey("authorization"); // BearerToken authentication
    }

    const response = await this.request({
      path: url,
      method: 'GET',
      headers: headerParameters,
    });

    return response.json();
  }
}
