// k8s.io/apimachinery/pkg/util/duration.HumanDuration
export const humanDuration = (d: number): string => {
  const seconds = Math.floor(d / 1000);
  if (seconds < -1) {
    return '<invalid>';
  } else if (seconds < 0) {
    return '0s';
  } else if (seconds < 60 * 2) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 10) {
    const s = seconds - minutes * 60;
    return (s == 0) ? `${minutes}m` : `${minutes}m${s}s`;
  } else if (minutes < 60 * 3) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 8) {
    const m = minutes - hours * 60;
    return (m == 0) ? `${hours}h` : `${hours}h${m}m`;
  } else if (hours < 48) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (hours < 24 * 8) {
    const h = hours - days * 24;
    return (h == 0) ? `${days}d` : `${days}d${h}h`;
  } else if (hours < 24 * 365 * 2) {
    return `${days}d`;
  }

  const years = Math.floor(days / 365);
  if (hours < 24 * 365 * 8) {
    const d = days - years * 24;
    return (d == 0) ? `${years}y` : `${years}y${d}d`;
  }
  return `${years}y`;
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
