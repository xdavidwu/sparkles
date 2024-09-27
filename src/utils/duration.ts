// k8s.io/apimachinery/pkg/util/duration.HumanDuration
const units = [
  { name: 'm', of: 60, threshold: 2, detailsThreshold: 10 },
  { name: 'h', of: 60, threshold: 3, detailsThreshold: 8 },
  { name: 'd', of: 24, threshold: 2, detailsThreshold: 8 },
  { name: 'y', of: 365, threshold: 2, detailsThreshold: 8 },
];
export const humanDuration = (d: number): string => {
  const seconds = Math.floor(d / 1000);
  if (seconds < -1) {
    return '<invalid>';
  } else if (seconds < 0) {
    return '0s';
  }

  let currentUnit = 's';
  let value = seconds;
  for (const unit of units) {
    if (value < unit.of * unit.threshold) {
      return `${value}${currentUnit}`;
    }
    const valueInUnit = Math.floor(value / unit.of);
    if (valueInUnit < unit.detailsThreshold) {
      const r = value - unit.of * valueInUnit;
      return (r == 0) ? `${valueInUnit}${unit.name}` : `${valueInUnit}${unit.name}${r}${currentUnit}`;
    }
    value = valueInUnit;
    currentUnit = unit.name;
  }
  return `${value}${currentUnit}`;
};

const suffixMap: { [key: string]: number } = {
  's': 1,
  'm': 60,
  'h': 60 * 60,
  'd': 60 * 60 * 24,
  'y': 60 * 60 * 24 * 365,
};

export const humanDurationToS = (h?: string) => {
  let s = 0;
  let digits = '';
  for (const c of h ?? '') {
    if (c >= '0' && c <= '9') {
      digits += c;
    } else if (suffixMap[c]) {
      if (!digits.length) {
        return undefined;
      }
      s += parseInt(digits, 10) * suffixMap[c];
      digits = '';
    } else {
      return undefined;
    }
  }
  return s;
};
