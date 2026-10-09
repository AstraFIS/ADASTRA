import { useState } from 'react';
import { formatCompactCurrency, formatInteger } from '@/lib/format';
import type { BingBreakdown } from '@/types/bing';

interface Props {
  title: string;
  caption: string;
  data: BingBreakdown;
  color: string;
  /** Rows shown before "Show all". */
  limit?: number;
}

/**
 * Partner-side breakdown (device or region): one row per value with a visitors bar,
 * then purchases and revenue so the useful segments stand out without hovering.
 */
export default function BingBreakdownCard({ title, caption, data, color, limit = 8 }: Props) {
  const [showAll, setShowAll] = useState(false);
  const items = showAll ? data.items : data.items.slice(0, limit);
  const max = Math.max(1, ...data.items.map((i) => i.visitors));
  const known = data.items.reduce((s, i) => s + i.visitors, 0);

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-3">{caption}</p>
        </div>
        {data.items.length > limit && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-azure transition-colors hover:bg-line"
          >
            {showAll ? `Top ${limit}` : `All ${data.items.length} →`}
          </button>
        )}
      </div>

      {data.items.length === 0 ? (
        <div className="flex min-h-[160px] flex-1 items-center justify-center text-center text-sm text-ink-3">
          No {title.toLowerCase().replace(/^by /, '')} information from the partner for this selection.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-[minmax(70px,120px)_1fr_auto] items-center gap-x-3 border-b border-line pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
            <span>{title.replace(/^.*by /i, '')}</span>
            <span>Visitors</span>
            <span className="w-[120px] text-right">Purch · Revenue</span>
          </div>
          <ul className={`divide-y divide-line/60 ${showAll ? 'max-h-[360px] overflow-y-auto pr-1' : ''}`}>
            {items.map((i) => (
              <li
                key={i.label}
                title={`${i.label}: ${i.visitors} visitors · ${i.landing_page_views} landing page views · ${i.quiz_starts} quiz starts · ${i.purchases} purchases`}
                className="grid grid-cols-[minmax(70px,120px)_1fr_auto] items-center gap-x-3 py-1.5"
              >
                <span className="truncate text-sm text-ink-2">{i.label}</span>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 min-w-0 flex-1">
                    <div className="h-full rounded-r-sm" style={{ width: `${(i.visitors / max) * 100}%`, minWidth: 2, background: color }} />
                  </div>
                  <span className="w-7 shrink-0 text-right text-xs tabular-nums text-ink-2">{formatInteger(i.visitors)}</span>
                </div>
                <div className="flex w-[120px] items-baseline justify-end gap-3 tabular-nums">
                  <span className={`text-xs ${i.purchases ? 'font-bold text-ink' : 'text-ink-3'}`}>{i.purchases}</span>
                  <span className={`w-14 text-right text-sm ${i.revenue_usd ? 'font-bold text-revenue' : 'text-ink-3'}`}>
                    {i.revenue_usd ? formatCompactCurrency(i.revenue_usd) : '—'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.unknown_visitors > 0 && (
        <p className="mt-auto pt-3 text-xs text-ink-3">
          + {formatInteger(data.unknown_visitors)} visitor{data.unknown_visitors === 1 ? '' : 's'} the partner sent without
          this field{known ? ` (shown above: ${formatInteger(known)})` : ''}.
        </p>
      )}
    </div>
  );
}
