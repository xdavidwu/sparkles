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

const unitMap: { [key: string]: number } = {
  'ns': 1e-9,
  'µs': 1e-6,
  'ms': 1e-3,
  's': 1,
  'm': 60,
  'h': 60 * 60,
  'd': 60 * 60 * 24,
  'y': 60 * 60 * 24 * 365,
};

// also compatible with time.Duration.String
export const durationToS = (h?: string) => {
  let s = 0;
  let digits = '';
  let unit = '';

  // special case for time.Duration.String: 0 has no unit
  if (h == '0') {
    return 0;
  }

  for (const c of h ?? '') {
    if (c >= '0' && c <= '9' || c == '-' || c == '.') {
      digits += c;
    } else {
      unit += c;
      if (unitMap[unit]) {
        if (!digits.length) {
          return undefined;
        }
        s += parseFloat(digits) * unitMap[unit]!;
        digits = '';
        unit = '';
      }
    }
  }

  if (digits.length != 0) {
    return undefined;
  }
  return s;
};
