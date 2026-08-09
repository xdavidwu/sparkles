import { createApp, type Component } from 'vue';
import type { ComponentProps } from 'vue-component-type-helpers';

export const instantiateComponent = <C extends Component>(comp: C, props: ComponentProps<C>): HTMLElement => {
  const div = document.createElement('div');
  const vue = createApp(comp, props);
  vue.mount(div);
  return div;
};
