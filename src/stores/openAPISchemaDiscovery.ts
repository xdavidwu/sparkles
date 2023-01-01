import { defineStore } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { AnyApi, type AnyApiGetOpenAPISchemaRequest } from '@/utils/AnyApi';
import type { OpenAPIV3 } from 'openapi-types';

interface State {
  _schemas: Map<string, OpenAPIV3.Document>,
  _api: AnyApi | null,
}

const indexOf = (api: AnyApiGetOpenAPISchemaRequest) => `${api.group ?? ''}/${api.version}`;

export const useOpenAPISchemaDiscovery = defineStore('openapi-discovery', {
  state: (): State => {
    return { _schemas: new Map(), _api : null };
  },
  actions: {
    async getSchema(api: AnyApiGetOpenAPISchemaRequest): Promise<OpenAPIV3.Document> {
      const index = indexOf(api);
      const schema = this._schemas.get(index);
      if (schema) {
        return schema;
      } else {
        if (!this._api) {
          this._api = new AnyApi(await useApiConfig().getConfig());
        }
        const schema = await this._api.getOpenAPISchema(api);
        this._schemas.set(index, schema);
        return schema;
      }
    }
  },
});
