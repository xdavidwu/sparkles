// https://tc39.es/ecma402/#sec-createdatetimeformat
// but more fixed-width
const intlDateOpts: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};
const intlTimeOpts: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

export const dateFormatter = new Intl.DateTimeFormat(undefined, intlDateOpts);
export const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  ...intlDateOpts,
  ...intlTimeOpts,
});

// invalid date (NaN) throws unlike toLocale*String
export const formatDate = dateFormatter.format;
export const formatDateTime = dateTimeFormatter.format;
