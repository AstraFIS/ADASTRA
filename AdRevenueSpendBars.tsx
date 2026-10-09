import { formatCompactCurrency, formatCurrency, formatPercent } from '@/lib/format';
import type { AdRevenueSpend } from '@/types/fbCharts';

interface Props {
  ads: AdRevenueSpend[];
  revenueColor: string;
  spendColor: string;
  className?: string;
}

/**
 * Compact horizontal comparison: one row per ad with a revenue bar and a spend bar on a
 * shared scale, then the ad's net result (revenue − spend) and ROAS so the verdict is
 * readable without hovering.
 */
export default function AdRevenueSpendBars({ ads, revenueColor, spendColor, className = '' }: Props) {
  const max = Math.max(1, ...ads.flatMap((a) => [a.revenue_usd, a.total_spend_usd]));
  const pct = (v: number) => `${Math.max(0, (v / max) * 100)}%`;

  return (
    <div className={className}>
      <div className="grid grid-cols-[minmax(80px,120px)_1fr_auto] items-center gap-x-3 border-b border-line pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
        <span>Ad</span>
        <span>Revenue / Spent</span>
        <span className="w-[112px] text-right">Net · ROAS</span>
      </div>

      <ul className="divide-y divide-line/60">
        {ads.map((a) => {
          const net = a.revenue_usd - a.total_spend_usd;
          // same definition as the Net Profit / ROAS tile: net ÷ spend
          const roas = a.total_spend_usd > 0 ? net / a.total_spend_usd : null;
          const tip = `${a.ad_name} — Revenue ${formatCurrency(a.revenue_usd)} · Spent ${formatCurrency(a.total_spend_usd)} · Net ${formatCurrency(net)}`;
          return (
            <li
              key={a.ad_name}
              title={tip}
              className="grid grid-cols-[minmax(80px,120px)_1fr_auto] items-center gap-x-3 py-1 hover:bg-surface-2/60"
            >
              <span className="truncate text-sm text-ink-2">{a.ad_name}</span>

              <div className="space-y-0.5">
                <Bar width={pct(a.revenue_usd)} color={revenueColor} value={a.revenue_usd} />
                <Bar width={pct(a.total_spend_usd)} color={spendColor} value={a.total_spend_usd} />
              </div>

              <div className="flex w-[112px] items-baseline justify-end gap-2 tabular-nums">
                <span className={`text-sm font-bold ${net >= 0 ? 'text-revenue' : 'text-loss'}`}>
                  {net > 0 ? '+' : ''}
                  {formatCompactCurrency(net)}
                </span>
                <span className="w-[42px] text-right text-xs text-ink-3">
                  {roas === null ? '—' : formatPercent(roas, 0)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <table className="sr-only">
        <caption>Revenue and amount spent by ad name</caption>
        <thead>
          <tr>
            <th scope="col">Ad</th>
            <th scope="col">Revenue</th>
            <th scope="col">Amount spent</th>
            <th scope="col">Net</th>
          </tr>
        </thead>
        <tbody>
          {ads.map((a) => (
            <tr key={a.ad_name}>
              <th scope="row">{a.ad_name}</th>
              <td>{formatCurrency(a.revenue_usd)}</td>
              <td>{formatCurrency(a.total_spend_usd)}</td>
              <td>{formatCurrency(a.revenue_usd - a.total_spend_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bar({ width, color, value }: { width: string; color: string; value: number }) {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <div className="h-2 min-w-0 flex-1">
        {value > 0 ? (
          <div className="h-full rounded-r-sm" style={{ width, background: color, minWidth: 2 }} />
        ) : (
          <div className="h-full w-0.5 bg-line-strong" />
        )}
      </div>
      <span className="w-[44px] shrink-0 text-right text-[10px] leading-[14px] tabular-nums text-ink-2">
        {value > 0 ? formatCompactCurrency(value) : '$0'}
      </span>
    </div>
  );
}
