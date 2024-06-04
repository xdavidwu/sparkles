import { useApiConfig } from '@/stores/apiConfig';
import type { Chart } from '@/utils/helm';
import '@/vendor/wasm_exec';

let goInitialized = false;

export const setup = async () => {
  if (goInitialized) {
    return;
  }
  const config = useApiConfig();
  const token = await config.getBearerToken();

  const go = new Go();
  const wasm = await WebAssembly.instantiateStreaming(
    fetch(`${window.__base_url}helm.wasm`), go.importObject);
  go.run(wasm.instance);
  goInitialized = true;

  _helm_configConnection({
    basePath: config.fullApiBasePath,
    accessToken: token,
    impersonation: config.impersonation,
  });
};

export const renderTemplate = async (chart: Array<Chart>, value: object) => {
  await setup();
  console.log(value);
  const result = await _helm_renderTemplate(chart.map((c) => JSON.stringify(c)), JSON.stringify(value));
  return result;
};
