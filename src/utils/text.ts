export const truncate = (s: string, toLength: number) =>
  s.length > toLength ? `${s.substring(0, toLength - 3)}...` : s;

export const truncateStart = (s: string, toLength: number) =>
  s.length > toLength ? `...${s.substring(s.length - (toLength - 3))}` : s;

// may be valid, but not typically at the end
const endHeuristic = '[^{}"%\\s\\.,:;\\?!\']';
const schemes = 'https?';
const unreserved = 'a-zA-Z0-9\\-\\._~';
const subDelims = '!$&\'\\(\\)\\*\\+,;=';
const userinfo = `[${unreserved}%${subDelims}:]+`;
const v6addr = '\\[[0-9a-f:]+\\]'; // probably good enough
const v4addr = '[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+'; // probably good enough
const regName = `[${unreserved}%${subDelims}]+`;
const pchar = `${unreserved}%${subDelims}:@`;
const pathAbempty = `(/[${pchar}]*)*`;
// simplified from rfc3986 for forms common for web
export const linkRegex = new RegExp(`${schemes}://(${userinfo}@)?(${v6addr}|${v4addr}|${regName})(:[0-9]+)?${pathAbempty}(\\?[${pchar}/\\?]*)?(#[${pchar}/\\?]*)?${endHeuristic}`, 'gd');
