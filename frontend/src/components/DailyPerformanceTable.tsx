import type { ReactNode } from 'react';
import { formatCurrency, formatDateNumeric, formatInteger, formatPercent } from '@/lib/format';
import type { DailyPoint } from '@/types/facebook';

interface Column {
  key: string;
  label: string;
  align: 'left' | 'right';
  render: (d: DailyPoint) => ReactNode;
}

/** "13 (108.3%)" — count and share of the previous funnel stage; "0 (—)" when the previous stage is 0. */
function Stage({ count, previous }: { count: number; previous: number }) {
  return (
    <>
      {formatInteger(count)}{' '}
      <span className="text-ink-2">({previous > 0 ? formatPercent(count / previous, 1) : '—'})</span>
    </>
  );
}

const COLUMNS: Column[] = [
  { key: 'date', label: 'Date', align: 'left', render: (d) => formatDateNumeric(d.date) },
  { key: 'spend', label: 'Spend', align: 'right', render: (d) => formatCurrency(d.spend) },
  { key: 'clicks', label: 'Clicks', align: 'right', render: (d) => formatInteger(d.linkClicks) },
  {
    key: 'pageVisit',
    label: 'Page Visit',
    align: 'right',
    render: (d) => <Stage count={d.funnel.firstPageView} previous={d.linkClicks} />,
  },
  {
    key: 'quizStart',
    label: 'Quiz Start',
    align: 'right',
    render: (d) => <Stage count={d.funnel.qs} previous={d.funnel.firstPageView} />,
  },
  {
    key: 'quizEnd',
    label: 'Quiz End',
    align: 'right',
    render: (d) => <Stage count={d.funnel.lead} previous={d.funnel.qs} />,
  },
  {
    key: 'addToCart',
    label: 'Add to Cart',
    align: 'right',
    render: (d) => <Stage count={d.funnel.addToCart} previous={d.funnel.lead} />,
  },
  {
    key: 'purchased',
    label: 'Purchased',
    align: 'right',
    render: (d) => <Stage count={d.funnel.purchase} previous={d.funnel.addToCart} />,
  },
  { key: 'cac', label: 'CAC', align: 'right', render: (d) => (d.cac === null ? '—' : formatCurrency(d.cac)) },
  {
    key: 'roas',
    label: 'ROAS',
    align: 'right',
    render: (d) =>
      d.roas === null ? (
        '—'
      ) : (
        <span className={d.roas < 0 ? 'text-loss' : 'text-revenue'}>{formatPercent(d.roas, 2)}</span>
      ),
  },
];

interface Props {
  daily: DailyPoint[];
}

export default function DailyPerformanceTable({ daily }: Props) {
  // days the ad actually ran; idle reporting days are left out
  const rows = daily.filter((d) => d.spend > 0 || d.linkClicks > 0);

  return (
    <section aria-labelledby="daily-performance-heading" className="rounded-xl border border-line bg-surface p-7">
      <h2 id="daily-performance-heading" className="text-lg font-bold text-ink">
        Daily Performance
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        Funnel stage counts shown as # (% of the previous stage) — Page Visit ÷ Clicks, Quiz Start ÷
        Page Visit, Quiz End ÷ Quiz Start, Add to Cart ÷ Quiz End, Purchased ÷ Add to Cart ·
        &quot;Purchased&quot; is the verified conversion count (CV) used for CAC/ROAS
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-ink-3">No spend or clicks recorded in the selected period.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`whitespace-nowrap px-3 py-3 text-sm font-semibold text-ink-2 ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.date} className="border-t border-line hover:bg-surface-2/40">
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-3 py-3 tabular-nums text-ink ${
                        c.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {c.render(d)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
