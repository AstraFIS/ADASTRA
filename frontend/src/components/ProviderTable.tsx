import { formatCurrency, formatNumber } from '@/lib/format';
import type { ProviderFeeStat } from '@/types/fbStatistics';

interface Props {
  providers: ProviderFeeStat[];
  busy?: boolean;
  /** Small text on the right of the title, e.g. "All ads · this month". */
  caption?: string;
}

const pct = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? '—' : `${formatNumber(v, digits)}%`);

/**
 * Compact ad platform provider card: spend, fee (fee % under the name) and share of spend
 * per provider, a total row and the total with fees. Providers without spend in the period
 * are listed by name underneath. Sized to sit beside the daily trend chart.
 */
export default function ProviderTable({ providers, busy = false, caption }: Props) {
  const totals = providers.reduce(
    (t, p) => ({ spent: t.spent + p.amount_spent, fee: t.fee + p.provider_fee, total: t.total + p.total_with_fee }),
    { spent: 0, fee: 0, total: 0 },
  );
  const blended = totals.spent > 0 ? (totals.fee / totals.spent) * 100 : null;

  const active = providers.filter((p) => p.amount_spent > 0);
  const idle = providers.filter((p) => p.amount_spent === 0 && !p.no_provider);
  const rows = active.length > 0 ? active : providers;

  return (
    <section
      aria-labelledby="provider-fees-heading"
      aria-busy={busy}
      className={`flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-opacity ${busy ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="provider-fees-heading" className="text-base font-bold text-ink">
          Ad Platform Providers
        </h2>
        {caption && <p className="text-xs text-ink-2">{caption}</p>}
      </div>
      <p className="mt-0.5 text-xs text-ink-3">Fee = Spend × Fee % · no provider = no fee</p>

      {providers.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">No providers recorded.</p>
      ) : (
        <div className="mt-3 flex flex-1 flex-col">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
                <th scope="col" className="py-1.5 pr-2 font-medium">Provider</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">Spend</th>
                <th scope="col" className="py-1.5 pr-2 text-right font-medium">Fee</th>
                <th scope="col" className="w-[30%] py-1.5 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const share = p.share_pct ?? (totals.spent > 0 ? (p.amount_spent / totals.spent) * 100 : 0);
                const zero = p.amount_spent === 0;
                return (
                  <tr
                    key={p.provider_name}
                    className={`border-t border-line align-top ${zero ? 'text-ink-3' : 'text-ink'}`}
                    title={`${p.provider_name}: total with fee ${formatCurrency(p.total_with_fee)}`}
                  >
                    <td className="py-2 pr-2">
                      <span className={`block truncate ${p.no_provider ? 'italic text-ink-2' : 'font-semibold'}`}>
                        {p.provider_name}
                      </span>
                      <span className="text-[11px] text-ink-3 tabular-nums">fee {pct(p.fee_pct)}</span>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(p.amount_spent)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(p.provider_fee)}</td>
                    <td className="py-2">
                      <span className="block text-right text-xs font-semibold tabular-nums">{pct(share, 1)}</span>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-violet"
                          style={{ width: `${Math.min(100, Math.max(0, share))}%`, minWidth: share > 0 ? 3 : 0 }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-strong font-bold text-ink">
                <td className="py-2 pr-2">
                  Total
                  <span className="block text-[11px] font-normal text-ink-3 tabular-nums" title="Blended fee rate">
                    fee {pct(blended)}
                  </span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(totals.spent)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(totals.fee)}</td>
                <td className="py-2 text-right text-xs tabular-nums">100%</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-auto flex items-baseline justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="text-ink-2">Total spend with fees</span>
            <span className="font-bold tabular-nums text-ink">{formatCurrency(totals.total)}</span>
          </div>
          {active.length > 0 && idle.length > 0 && (
            <p className="mt-2 text-[11px] text-ink-3" title={idle.map((p) => `${p.provider_name} (${pct(p.fee_pct)})`).join(', ')}>
              +{idle.length} provider{idle.length === 1 ? '' : 's'} with no spend in this period:{' '}
              {idle.map((p) => p.provider_name).join(', ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
