import { defineStore } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { AnyApi, type AnyApiGetOpenAPISchemaRequest } from '@/utils/AnyApi';
import { openapiSchemaToJsonSchema } from '@openapi-contrib/openapi-schema-to-json-schema';
import { V2ResourceScope, type V2APIResourceDiscovery } from '@/utils/discoveryV2'; 
import type { OpenAPIV3 } from 'openapi-types';
import type { JSONSchema4 } from 'json-schema';

const indexOf = (api: AnyApiGetOpenAPISchemaRequest) => `${api.group ?? ''}/${api.version}`;

export const useOpenAPISchemaDiscovery = defineStore('openapi-discovery', () => {
  const schemas: Map<string, Promise<OpenAPIV3.Document>> = new Map();
  let api: AnyApi | null = null;

  const getSchema = (r: AnyApiGetOpenAPISchemaRequest): Promise<OpenAPIV3.Document> => {
    const index = indexOf(r);
    let schema = schemas.get(index);
    if (!schema) {
      schema = (async () => {
        if (!api) {
          api = new AnyApi(await useApiConfig().getConfig());
        }
        return api.getOpenAPISchema(r);
      })();
      schemas.set(index, schema);
    }
    return schema;
  };

  const getJSONSchema = async (r: {
    group?: string,
    version: string,
    type: V2APIResourceDiscovery,
  }): Promise<JSONSchema4> => {
    const root = await getSchema(r);
    const groupVersion = r.group ? `${r.group}/${r.version}` : r.version;

    const apiBase = `/api${r.group ? 's' : ''}/${groupVersion}`;
    const path = `${apiBase}/${r.type.scope === V2ResourceScope.Namespaced ? 'namespaces/{namespace}/' : ''}${r.type.resource}/{name}`;
    const response = (root.paths[path]?.get?.responses['200'] as OpenAPIV3.ResponseObject | undefined)
      ?.content?.['application/json']?.schema;

    if (!response) {
      throw new Error(`schema discovered, but no response definition for: ${path}`);
    }

    return {
      title: `OpenAPI schema of ${groupVersion} ${r.type.responseKind.kind}`,
      allOf: [
        openapiSchemaToJsonSchema(response),
        {
          type: 'object',
          required: ['apiVersion', 'kind'],
          properties: {
            apiVersion: {
              type: 'string',
              'const': groupVersion,
            },
            kind: {
              type: 'string',
              'const': r.type.responseKind.kind,
            },
          },
        },
      ],
      components: {
        schemas: root.components?.schemas ?
          Object.keys(root.components.schemas).reduce((a, v) => {
            a[v] = openapiSchemaToJsonSchema(root.components!.schemas![v]);
            return a;
          }, {} as { [key: string]: JSONSchema4 }) : {},
      },
    };
  };

  return { getSchema, getJSONSchema };
});
