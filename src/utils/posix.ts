const rwx = (m: number): string =>
  `${m & 4 ? 'r' : '-'}${m & 2 ? 'w' : '-'}${m & 1 ? 'x' : '-'}`;

// sys_stat.h(0p)
export enum S {
  // actual values not really defined in posix
  IFMT	= 0o170000,
  IFSOCK	= 0o140000,
  IFLNK	= 0o120000,
  IFREG	= 0o100000,
  IFBLK	= 0o060000,
  IFDIR	= 0o040000,
  IFCHR	= 0o020000,
  IFIFO	= 0o010000,

  // with values defined in posix
  ISUID	= 0o4000,
  ISGID	= 0o2000,
  ISVTX	= 0o1000,
}

const entryTypeChar = {
  [S.IFSOCK]:	's',
  [S.IFLNK]:	'l',
  [S.IFREG]:	'-',
  [S.IFBLK]:	'b',
  [S.IFDIR]:	'd',
  [S.IFCHR]:	'c',
  [S.IFIFO]:	'p',
};

export const isExecutable = (mod: number) =>
  ((mod >> 6) & 1) | ((mod >> 3) & 1) | (mod & 1);

// ls(1p)
export const modfmt = (mod: number): string => {
  const res = Array.from(`${rwx(mod >> 6)}${rwx(mod >> 3)}${rwx(mod)}`);
  const executable = isExecutable(mod);

  if ((mod & S.ISUID) == S.ISUID) {
    if (!executable) {
      // If in <owner permissions>, the file is not executable and set-user-ID mode is set.
      res[2] = 'S';
    } else {
      // If in <owner permissions>, the file is executable and set-user-ID mode is set.
      res[2] = 's';
    }
  }
  if ((mod & S.ISGID) == S.ISGID) {
    if (!executable) {
      // If in <group permissions>, the file is not executable and set-group-ID mode is set.
      res[5] = 'S';
    } else {
      // If in <group permissions>, the file is executable and set-group-ID mode is set.
      res[5] = 's';
    }
  }
  if ((mod & S.ISVTX) == S.ISVTX) {
    if (!executable) {
      // If in <other permissions> and the file is a directory, search permission is not granted to others, and the restricted deletion flag is set.
      res[5] = 'T';
    } else {
      // If in <other permissions> and the file is a directory, search permission is granted to others, and the restricted deletion flag is set.
      res[5] = 't';
    }
  }
  const type = mod & S.IFMT;
  return `${entryTypeChar[type as keyof typeof entryTypeChar] ?? '?'}${res.join('')}`;
};

export const normalizeAbsPath = (p: string) => {
  const components = p.split('/').filter((c) => c.length && c != '.');
  const results = [];
  for (const c of components) {
    if (c == '..') {
      if (results.length) {
        results.pop();
      }
    } else {
      results.push(c);
    }
  }
  return `/${results.join('/')}`;
};
