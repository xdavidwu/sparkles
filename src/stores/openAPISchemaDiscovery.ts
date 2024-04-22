import { defineStore } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { AnyApi, type AnyApiGetOpenAPISchemaRequest } from '@/utils/AnyApi';
import type { OpenAPIV3 } from 'openapi-types';

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

  return { getSchema };
});
