const rwx = (m: number): string =>
  `${m & 4 ? 'r' : '-'}${m & 2 ? 'w' : '-'}${m & 1 ? 'x' : '-'}`;

export enum S {
  ISUID = 0o4000,
  ISGID = 0o2000,
  ISVTX = 0o1000,
}

export const isExecutable = (mod: number) =>
  ((mod >> 6) & 1) | ((mod >> 3) & 1) | (mod & 1);

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
  return res.join('');
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
