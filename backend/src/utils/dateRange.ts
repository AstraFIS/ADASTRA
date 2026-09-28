import { DATE_RANGE_KEYS, type DateRangeKey, type DateRangeOption } from '../types/facebook.js';

export const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'last_7_days', label: 'Last 7 Days' },
  { key: 'last_30_days', label: 'Last 30 Days' },
  { key: 'all_time', label: 'All Time' },
];

export function isDateRangeKey(value: unknown): value is DateRangeKey {
  return typeof value === 'string' && (DATE_RANGE_KEYS as readonly string[]).includes(value);
}

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/**
 * Resolve a named range to inclusive YYYY-MM-DD bounds, anchored on `anchorIso`
 * (the latest day that has data). `all_time` returns null = no bounds.
 */
export function resolveRange(key: DateRangeKey, anchorIso: string): { from: string; to: string } | null {
  const anchor = new Date(`${anchorIso}T00:00:00Z`);
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const d = anchor.getUTCDate();

  switch (key) {
    case 'this_month':
      return { from: isoDay(utc(y, m, 1)), to: anchorIso };
    case 'last_month':
      return { from: isoDay(utc(y, m - 1, 1)), to: isoDay(utc(y, m, 0)) };
    case 'last_7_days':
      return { from: isoDay(utc(y, m, d - 6)), to: anchorIso };
    case 'last_30_days':
      return { from: isoDay(utc(y, m, d - 29)), to: anchorIso };
    case 'all_time':
      return null;
  }
}
