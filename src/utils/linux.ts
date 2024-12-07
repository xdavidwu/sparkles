// passwd(5)
export interface Passwd {
  name: string;
  password: string;
  uid: number;
  gid: number;
  gecos: string;
  directory: string;
  shell: string;
};

export const parsePasswdLine = (s: string): Passwd | undefined => {
  const fields = s.split(':');
  if (fields.length != 7) {
    return;
  }
  return {
    name: fields[0],
    password: fields[1],
    uid: parseInt(fields[2], 10),
    gid: parseInt(fields[3], 10),
    gecos: fields[4],
    directory: fields[5],
    shell: fields[6],
  };
};

// group(5)
export interface Group {
  groupName: string;
  password: string;
  gid: number;
  userList: Array<string>;
};

export const parseGroupLine = (s: string): Group | undefined => {
  const fields = s.split(':');
  if (fields.length != 4) {
    return;
  }
  return {
    groupName: fields[0],
    password: fields[1],
    gid: parseInt(fields[2], 10),
    userList: fields[3].length ? fields[3].split(',') : [],
  };
};
