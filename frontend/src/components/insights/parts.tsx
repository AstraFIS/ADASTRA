import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatInteger, formatNumber } from '@/lib/format';

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

export const usd = (v: number | null | undefined) => (v == null ? '—' : formatCurrency(v, { whole: true }));
export const int = (v: number | null | undefined) => (v == null ? '—' : formatInteger(Math.round(v)));
export const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v.toFixed(d)}%`);
export const times = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(2)}×`);
export const dec = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2));
/** 32 → "32", 9.4 → "9.4" (sales split across ad sets can be fractional) */
export const num1 = (v: number | null | undefined) => (v == null ? '—' : formatNumber(v, 1));
/** 1 → "1 sale", 3 → "3 sales" */
export const plural = (n: number, word: string) => `${formatInteger(Math.round(n))} ${word}${Math.round(n) === 1 ? '' : 's'}`;
export const shortDay = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/** Green when at or under break-even return, red when it lost money (only when there were sales). */
export const roasTone = (roas: number | null, purchases: number) => (roas == null ? '' : roas >= 1 ? 'text-revenue' : purchases > 0 ? 'text-loss' : '');
export const cpaTone = (cpa: number | null, be: number) => (cpa == null ? '' : cpa <= be ? 'text-revenue' : cpa <= be * 1.25 ? 'text-spend' : 'text-loss');

// ---------------------------------------------------------------------------
// pills
// ---------------------------------------------------------------------------

export type Tone = 'good' | 'ok' | 'warn' | 'bad' | 'muted';
const TONE: Record<Tone, string> = {
  good: 'border-revenue/70 text-revenue',
  ok: 'border-line-strong text-revenue',
  warn: 'border-spend/70 text-spend',
  bad: 'border-loss/70 text-loss',
  muted: 'border-line-strong text-ink-2',
};
export const VERDICT_TONE: Record<string, Tone> = {
  Scale: 'good',
  'Keep & watch': 'ok',
  'Over break-even': 'bad',
  Promising: 'warn',
  'Still testing': 'muted',
  'Near cut': 'bad',
  Cut: 'bad',
  'No purchase data yet': 'muted',
  'Turn back on': 'good',
  Keep: 'ok',
  Watch: 'warn',
  'Too early': 'muted',
  'Not spending': 'bad',
  'No tracking': 'muted',
};
export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[tone]}`}>{children}</span>;
}
export function PillButton({ children, tone = 'muted', active, onClick }: { children: ReactNode; tone?: Tone; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active ? 'border-ink bg-ink text-canvas' : `${TONE[tone]} hover:border-current`
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

export function Card({
  title,
  sub,
  right,
  children,
  id,
  className = '',
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-6 rounded-2xl border border-line bg-surface p-5 md:p-6 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
            {sub && <p className="mt-1 max-w-4xl text-sm text-ink-3">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${tone === 'good' ? 'text-revenue' : tone === 'bad' ? 'text-loss' : 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export function AdLink({ name }: { name: string }) {
  return (
    <Link to={`/platforms/facebook/ads/${encodeURIComponent(name)}`} className="font-medium text-ink hover:text-revenue hover:underline">
      {name}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// table
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** Value used for sorting; leave out for columns that can't be sorted. */
  sort?: (row: T) => number | string | null;
  align?: 'left' | 'right';
  className?: (row: T) => string;
  wrap?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  limit,
  empty = 'Nothing to show.',
  maxHeight,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; dir: 1 | -1 };
  limit?: number;
  empty?: string;
  maxHeight?: number;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [all, setAll] = useState(false);
  const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
  const sorted = col?.sort
    ? [...rows].sort((a, b) => {
        const x = col.sort!(a);
        const y = col.sort!(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort!.dir;
      })
    : rows;
  const shown = limit && !all ? sorted.slice(0, limit) : sorted;
  return (
    <div>
      <div className="overflow-auto rounded-xl border border-line" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir > 0 ? 'ascending' : 'descending') : undefined}
                    className={`whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-semibold uppercase tracking-wider ${
                      c.align === 'left' ? 'text-left' : 'text-right'
                    } ${active ? 'text-ink' : 'text-ink-3'}`}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        className="uppercase hover:text-ink"
                        onClick={() =>
                          setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: c.align === 'left' ? 1 : -1 }))
                        }
                      >
                        {c.label}
                        {active ? (sort!.dir > 0 ? ' ↑' : ' ↓') : ''}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-ink-3">
                  {empty}
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={rowKey(r)} className="border-b border-line/60 last:border-0 hover:bg-surface-2/50">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${c.wrap ? 'min-w-[260px] max-w-[440px]' : 'whitespace-nowrap'} ${c.align === 'left' ? 'text-left' : 'text-right'} ${
                      c.className?.(r) ?? ''
                    }`}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit && rows.length > limit && (
        <div className="mt-3 flex items-center gap-3 text-sm text-ink-3">
          <span>{all ? `Showing all ${rows.length}.` : `Showing ${limit} of ${rows.length}.`}</span>
          <button type="button" onClick={() => setAll((v) => !v)} className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 font-semibold text-ink hover:bg-line">
            {all ? 'Show fewer' : 'Show all'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// horizontal bars
// ---------------------------------------------------------------------------

export interface Bar {
  /** Identifies the bar for selection; defaults to the label. */
  id?: string;
  label: string;
  value: number | null;
  text: string;
  tone?: 'good' | 'bad' | 'neutral';
  title?: string;
  sub?: string;
}
const BAR_TONE = { good: 'bg-revenue', bad: 'bg-loss', neutral: 'bg-azure' };

export function HBars({
  bars,
  reference,
  referenceLabel,
  max,
  selected,
  onSelect,
}: {
  bars: Bar[];
  reference?: number;
  referenceLabel?: string;
  max?: number;
  /** With onSelect, every bar is a button; the selected one is outlined and the rest dimmed. */
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  const top = Math.max(max ?? 0, reference ?? 0, ...bars.map((b) => b.value ?? 0)) || 1;
  return (
    <div className="space-y-2.5">
      {bars.map((b) => {
        const id = b.id ?? b.label;
        const isSel = selected != null && selected === id;
        const dim = selected != null && !isSel;
        const Row = onSelect ? 'button' : 'div';
        return (
          <Row
            key={id}
            {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(id), 'aria-pressed': isSel } : {})}
            className={`grid w-full grid-cols-[minmax(110px,34%)_1fr] items-center gap-3 rounded-lg text-left transition-opacity ${
              onSelect ? 'cursor-pointer px-1 py-0.5 hover:bg-surface-2/70' : ''
            } ${isSel ? 'bg-surface-2 ring-1 ring-line-strong' : ''} ${dim ? 'opacity-55 hover:opacity-100' : ''}`}
            title={b.title}
          >
            <span className="block truncate text-right text-sm text-ink-2">
              {b.label}
              {b.sub && <span className="block text-xs text-ink-3">{b.sub}</span>}
            </span>
            <span className="relative flex h-6 items-center">
              <span
                className={`block h-full rounded-r ${BAR_TONE[b.tone ?? 'neutral']} opacity-85`}
                style={{ width: `${Math.max(0.5, ((b.value ?? 0) / top) * 82)}%` }}
              />
              <span className="ml-2 whitespace-nowrap text-xs font-semibold tabular-nums text-ink">{b.text}</span>
              {reference != null && (
                <span className="pointer-events-none absolute inset-y-[-4px] border-l border-dashed border-ink-3" style={{ left: `${(reference / top) * 82}%` }} />
              )}
            </span>
          </Row>
        );
      })}
      {reference != null && referenceLabel && (
        <div className="grid grid-cols-[minmax(110px,34%)_1fr] gap-3">
          <div />
          <div className="relative h-4 text-xs text-ink-3">
            <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(reference / top) * 82}%` }}>
              {referenceLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
