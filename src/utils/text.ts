export const truncate = (s: string, toLength: number) =>
  s.length > toLength ? `...${s.substring(s.length - (toLength - 3))}` : s;

export const truncateStart = (s: string, toLength: number) =>
  s.length > toLength ? `...${s.substring(s.length - (toLength - 3))}` : s;
