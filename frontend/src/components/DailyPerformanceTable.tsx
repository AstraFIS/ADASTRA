import type { ReactNode } from 'react';
import { formatCurrency, formatDateNumeric, formatInteger, formatPercent } from '@/lib/format';
import type { DailyTrendPoint } from '@/types/fbDailyTrend';

interface Column {
  key: string;
  label: string;
  /** Source field / formula in facebook_ad_reports, shown as a tooltip on the header. */
  source: string;
  align: 'left' | 'right';
  render: (d: DailyTrendPoint) => ReactNode;
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
  { key: 'date', label: 'Date', source: 'report_date', align: 'left', render: (d) => formatDateNumeric(d.date) },
  { key: 'spend', label: 'Spend', source: 'total_spend_usd (incl. provider fee)', align: 'right', render: (d) => formatCurrency(d.total_spend_usd) },
  { key: 'clicks', label: 'Clicks', source: 'link_clicks', align: 'right', render: (d) => formatInteger(d.link_clicks) },
  {
    key: 'pageVisit',
    label: 'Page Visit',
    source: 'first_page_views ÷ link_clicks',
    align: 'right',
    render: (d) => <Stage count={d.first_page_views} previous={d.link_clicks} />,
  },
  {
    key: 'quizStart',
    label: 'Quiz Start',
    source: 'questionnaire_starts ÷ first_page_views',
    align: 'right',
    render: (d) => <Stage count={d.questionnaire_starts} previous={d.first_page_views} />,
  },
  {
    key: 'quizEnd',
    label: 'Quiz End',
    source: 'leads_partial ÷ questionnaire_starts',
    align: 'right',
    render: (d) => <Stage count={d.leads_partial} previous={d.questionnaire_starts} />,
  },
  {
    key: 'addToCart',
    label: 'Add to Cart',
    source: 'add_to_carts ÷ leads_partial',
    align: 'right',
    render: (d) => <Stage count={d.add_to_carts} previous={d.leads_partial} />,
  },
  {
    key: 'purchased',
    label: 'Purchased',
    source: 'conversions ÷ add_to_carts (verified conversions, CV)',
    align: 'right',
    render: (d) => <Stage count={d.conversions} previous={d.add_to_carts} />,
  },
  { key: 'cac', label: 'CAC', source: 'total_spend_usd ÷ conversions', align: 'right', render: (d) => (d.cac_usd === null ? '—' : formatCurrency(d.cac_usd)) },
  {
    key: 'roas',
    label: 'ROAS',
    source: 'net_profit_usd ÷ total_spend_usd',
    align: 'right',
    render: (d) =>
      d.roas_pct === null ? (
        '—'
      ) : (
        <span className={d.roas_pct < 0 ? 'text-loss' : 'text-revenue'}>{formatPercent(d.roas_pct / 100, 2)}</span>
      ),
  },
];

interface Props {
  daily: DailyTrendPoint[];
  /** Shown while the data is (re)loading. */
  busy?: boolean;
  /** Replaces the table body, e.g. an error message. */
  notice?: ReactNode;
}

export default function DailyPerformanceTable({ daily, busy = false, notice }: Props) {
  // days the ad actually ran; idle days are absent from the series anyway
  const rows = daily.filter((d) => d.total_spend_usd > 0 || d.link_clicks > 0);

  return (
    <section
      aria-labelledby="daily-performance-heading"
      aria-busy={busy}
      className={`rounded-xl border border-line bg-surface p-7 transition-opacity ${busy ? 'opacity-70' : ''}`}
    >
      <h2 id="daily-performance-heading" className="text-lg font-bold text-ink">
        Daily Performance
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        Funnel stage counts shown as # (% of the previous stage) — Page Visit ÷ Clicks, Quiz Start ÷
        Page Visit, Quiz End ÷ Quiz Start, Add to Cart ÷ Quiz End, Purchased ÷ Add to Cart ·
        &quot;Purchased&quot; is the verified conversion count (CV) used for CAC/ROAS
      </p>

      {notice ? (
        <div className="mt-6 text-sm">{notice}</div>
      ) : rows.length === 0 ? (
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
                    title={c.source}
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
