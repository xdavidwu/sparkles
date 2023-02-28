import type { Ref } from 'vue';
import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    hidden?: boolean,
    namespaced?: boolean,
    name: string,
    unsupported?: Ref<string | undefined>,
  }
}
