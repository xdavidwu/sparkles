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

export const hashColor = async (str: string, baseColors: Array<BaseColor>,
    variants: Array<ColorVariant>): Promise<Color> => {
  const data = (new TextEncoder()).encode(str);
  let hash = (new Uint32Array(await window.crypto.subtle.digest('SHA-1', data)))[0];
  const base = baseColors[hash % baseColors.length];
  hash = Math.floor(hash / baseColors.length);
  return { color: base, variant: variants[hash % variants.length] };
};

export const colorToClass = (color: Color): string => 
  color.variant === ColorVariant.Base ? kebabCase(color.color) :
    `${kebabCase(color.color)}-${color.variant.replace(/\d/, '-$&')}`;

export const colorToCode = (color: Color): string => actualColors[color.color][color.variant];
