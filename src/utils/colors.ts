import actualColors from 'vuetify/util/colors';
import { kebabCase } from 'change-case';

export enum BaseColor {
  Red = 'red',
  Pink = 'pink',
  Purple = 'purple',
  DeepPurple = 'deepPurple',
  Indigo = 'indigo',
  Blue = 'blue',
  LightBlue = 'lightBlue',
  Cyan = 'cyan',
  Teal = 'teal',
  Green = 'green',
  LightGreen = 'lightGreen',
  Lime = 'lime',
  Yellow = 'yellow',
  Amber = 'amber',
  Orange = 'orange',
  DeepOrange = 'deepOrange',
  Brown = 'brown',
  BlueGrey = 'blueGrey',
  Grey = 'grey',
}

export enum ColorVariant {
  Base = 'base',
  Lighten1 = 'lighten1',
  Lighten2 = 'lighten2',
  Lighten3 = 'lighten3',
  Lighten4 = 'lighten4',
  Lighten5 = 'lighten5',
  Darken1 = 'darken1',
  Darken2 = 'darken2',
  Darken3 = 'darken3',
  Darken4 = 'darken4',
}

export interface Color {
  color: BaseColor,
  variant: ColorVariant,
}

const cache = new Map<string, Promise<number>>();

export const hashColor = async (str: string, baseColors: Array<BaseColor>,
    variants: Array<ColorVariant>): Promise<Color> => {
  if (!cache.has(str)) {
    cache.set(str, (async () => {
      const data = (new TextEncoder()).encode(str);
      return (new Uint32Array(await window.crypto.subtle.digest('SHA-1', data)))[0];
    })());
  }
  let hash = await cache.get(str)!;
  const base = baseColors[hash % baseColors.length];
  hash = Math.floor(hash / baseColors.length);
  return { color: base, variant: variants[hash % variants.length] };
};

// prefer this over css code when applicable
// bg-* classes, which vuetify useColor uses, contains fixed fg colors
// useColor also selects fg color by contrast if using css code for bg
// but handpicked, fixed fg colors via classes should be better
export const colorToClass = (color: Color): string => 
  color.variant === ColorVariant.Base ? kebabCase(color.color) :
    `${kebabCase(color.color)}-${color.variant.replace(/\d/, '-$&')}`;

export const colorToCode = (color: Color): string => actualColors[color.color][color.variant];
