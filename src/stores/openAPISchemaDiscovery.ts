import { defineStore } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { Configuration } from '@xdavidwu/kubernetes-client-typescript-fetch';
import { AnyApi, type AnyApiGetOpenAPISchemaRequest } from '@/utils/AnyApi';
import { extractUrl } from '@/utils/api';
import type { V2APIResourceDiscovery } from '@/utils/discoveryV2';
import { openapiSchemaToJsonSchema } from '@openapi-contrib/openapi-schema-to-json-schema';
import type { OpenAPIV3 } from 'openapi-types';
import type { JSONSchema4 } from 'json-schema';
import wellKnowns from '@/assets/wellKnowns.json';

const indexOf = (api: AnyApiGetOpenAPISchemaRequest) => `${api.group ?? ''}/${api.version}`;

const extractWellKnowns = (type: string): { [k in string]: JSONSchema4 } => Object.fromEntries(
  wellKnowns.filter((w) => w.types.includes(type))
    .map((w) => [w.key, { type: 'string', description: w.desc }]));

// TODO taints?
const wellKnownSchema: JSONSchema4 = {
  type: 'object',
  required: ['metadata'],
  properties: {
    metadata: {
      type: 'object',
      properties: {
        annotations: {
          type: 'object',
          properties: extractWellKnowns('annotations'),
        },
        labels: {
          type: 'object',
          properties: extractWellKnowns('labels'),
        },
      },
    },
  },
};

export const useOpenAPISchemaDiscovery = defineStore('openapi-discovery', () => {
  const schemas: Map<string, Promise<OpenAPIV3.Document>> = new Map();
  let api: AnyApi | undefined;

  const getSchema = (r: AnyApiGetOpenAPISchemaRequest): Promise<OpenAPIV3.Document> => {
    const index = indexOf(r);
    if (!schemas.has(index)) {
      schemas.set(index, (async () => {
        if (!api) {
          api = new AnyApi(await useApiConfig().getConfig());
        }
        return api.getOpenAPISchema(r);
      })());
    }
    return schemas.get(index)!;
  };

  const getJSONSchema = async (r: {
    group?: string,
    version: string,
    type: V2APIResourceDiscovery,
  }): Promise<JSONSchema4> => {
    const root = await getSchema(r);

    const fakeApi = new AnyApi(new Configuration(
      { basePath: '', middleware: [] }));
    const path = decodeURIComponent(await extractUrl(fakeApi,
      (api) => api[`get${r.type.scope}CustomObjectRaw`]({
        group: r.group,
        version: r.version,
        plural: r.type.resource,
        namespace: '{namespace}',
        name: '{name}',
      })));

    const response = (root.paths[path]?.get?.responses['200'] as OpenAPIV3.ResponseObject | undefined)
      ?.content?.['application/json']?.schema;

    if (!response) {
      throw new Error(`schema discovered, but no response definition for: ${path}`);
    }

    const groupVersion = r.group ? `${r.group}/${r.version}` : r.version;
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
        wellKnownSchema,
      ],
      components: {
        schemas: root.components?.schemas ?
          Object.fromEntries(Object.entries(root.components.schemas).map(([k, v]) =>
            [ k, openapiSchemaToJsonSchema(v) ])) : {},
      },
    };
  };

  return { getSchema, getJSONSchema };
});
