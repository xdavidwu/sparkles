import {
  BaseAPI,
  Configuration,
  type V1APIResourceList,
  V1APIResourceListFromJSON,
  type HTTPHeaders,
  JSONApiResponse
} from '@/kubernetes-api/src';

export class AnyApi extends BaseAPI {
  private path: string;

  constructor(config: Configuration, apiGroup: string, apiVersion: string) {
    super(config);
    if (apiGroup) {
      this.path = `/apis/${apiGroup}/${apiVersion}/`;
    } else {
      this.path = `/api/${apiVersion}/`;
    }
  }

  async getAPIResources(): Promise<V1APIResourceList> {
    const headers: HTTPHeaders = {};

    if (this.configuration && this.configuration.apiKey) {
      headers['authorization'] = this.configuration.apiKey('authorization');
    }

    const response = await this.request({
      path: this.path,
      method: 'GET',
      headers
    });

    return await (new JSONApiResponse(
      response,
      (v) => V1APIResourceListFromJSON(v)
    )).value();
  }

  // TODO: type this
  async listResourcesAsTable(kind: string, namespace: string = ''):
      Promise<Object> {
    const headers: HTTPHeaders = {
      accept: 'application/json;as=Table;g=meta.k8s.io;v=v1',
    };

    if (this.configuration && this.configuration.apiKey) {
      headers['authorization'] = this.configuration.apiKey('authorization');
    }

    let path = this.path + kind;
    if (namespace) {
      path = `${this.path}namespaces/${namespace}/${kind}`;
    }

    return (await this.request({
      path,
      method: 'GET',
      headers
    })).json();
  }

  async getResource(kind: string, name: string, namespace: string = ''):
      Promise<Object> {
    const headers: HTTPHeaders = {};

    if (this.configuration && this.configuration.apiKey) {
      headers['authorization'] = this.configuration.apiKey('authorization');
    }

    let path;
    if (namespace) {
      path = `${this.path}namespaces/${namespace}/${kind}/${name}`;
    } else {
      path = `${this.path}${kind}/${name}`;
    }

    return (await this.request({
      path,
      method: 'GET',
      headers
    })).json();
  }
}