/**
 * Bing collections accept their day field either as a real Date or as text "DD/MM/YYYY"
 * (e.g. "01/10/2026" = 1 October 2026), so files imported by hand through Compass work too.
 */

const DMY = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/;
const YMD = /^\s*(\d{4})-(\d{2})-(\d{2})/;

/** "01/10/2026" → Date(2026-10-01 UTC). Day first, never US month-first. Anything else is returned unchanged. */
export function parseDayMonthYear(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const dmy = DMY.exec(value);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  const ymd = YMD.exec(value);
  if (ymd) return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
  return value;
}

/** Aggregation expression: the field as a Date whether it is stored as a Date, "DD/MM/YYYY" or "YYYY-MM-DD". */
export function dayExpr(field: string): Record<string, unknown> {
  const f = `$${field}`;
  return {
    $cond: [
      { $eq: [{ $type: f }, 'string'] },
      {
        $dateFromString: {
          dateString: { $trim: { input: f } },
          format: '%d/%m/%Y',
          timezone: 'UTC',
          onError: { $dateFromString: { dateString: { $trim: { input: f } }, timezone: 'UTC', onError: null, onNull: null } },
          onNull: null,
        },
      },
      f,
    ],
  };
}
