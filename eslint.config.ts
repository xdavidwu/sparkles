import js from '@eslint/js';
import vuePlugin from 'eslint-plugin-vue';
import vueTsConfig from '@vue/eslint-config-typescript';
import type { Linter } from "eslint";

const config: Array<Linter.Config> = [
  ...vuePlugin.configs['flat/essential'],
  js.configs.recommended,
  ...vueTsConfig(),
  {
    ignores: ['**/vendor/*.js', 'dist/*'],
  },
];

export default config;
