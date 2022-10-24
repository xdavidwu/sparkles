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
}
