// @ts-expect-error Missing type definitions
import actualColors from 'vuetify/lib/util/colors';
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

const fnv1 = (str: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash = hash * 0x01000193;
    hash = Math.abs(hash ^ str.charCodeAt(i));
  }
  return hash;
};

export interface Color {
  color: BaseColor,
  variant: ColorVariant,
}

export const hashColor = (str: string, baseColors: Array<BaseColor>,
    variants: Array<ColorVariant>): Color => {
  let hash = fnv1(str);
  const base = baseColors[hash % baseColors.length];
  hash = Math.floor(hash / baseColors.length);
  return { color: base, variant: variants[hash % variants.length] };
};

export const colorToClass = (color: Color): string => 
  color.variant === ColorVariant.Base ? kebabCase(color.color) :
    `${kebabCase(color.color)}-${color.variant.replace(/\d/, '-$&')}`;

export const colorToCode = (color: Color): string => actualColors[color.color][color.variant];
