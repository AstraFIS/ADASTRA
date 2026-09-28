const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const integer = new Intl.NumberFormat('en-US');

/** $2,250.00 · negatives use a true minus sign: −$3,887.92 */
export function formatCurrency(value: number, opts: { whole?: boolean } = {}): string {
  const fmt = opts.whole ? currencyWhole : currency;
  return fmt.format(value).replace(/^-/, '−');
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 2890.5 → "$2.9K", 675.3 → "$675" — for labels sitting on top of bars */
export function formatCompactCurrency(value: number): string {
  const text =
    Math.abs(value) < 1000 ? currencyWhole.format(value) : compactCurrency.format(value);
  return text.replace(/^-/, '\u2212');
}

/** ["A"] → "A"; ["A","B"] → "A and B"; ["A","B","C"] → "A, B and C" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** 0.034 → "3.40%", -0.275 → "−27.5%" */
export function formatPercent(value: number, digits = 2): string {
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return fmt.format(value).replace(/^-/, '−');
}

/** "2026-09-25" → "September 25, 2026" (long) or "Sep 25" (short). Dates are treated as UTC calendar days. */
export function formatDate(isoDate: string, style: 'long' | 'medium' | 'short' = 'long'): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
      : style === 'medium'
        ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
        : { month: 'short', day: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat('en-US', options).format(date);
}

/** "2026-09-01" → "01/09" (day/month) for compact axis labels */
export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return month && day ? `${day}/${month}` : isoDate;
}
