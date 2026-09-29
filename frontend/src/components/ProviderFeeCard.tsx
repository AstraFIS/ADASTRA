import { formatCurrency, formatPercent } from '@/lib/format';

interface Props {
  provider: {
    name: string;
    /** Fee rate as a fraction (0.0638), or null when nothing was spent in the period. */
    feeRate: number | null;
    amountSpent: number;
    providerFee: number;
    totalWithFee: number;
  };
}

export default function ProviderFeeCard({ provider }: Props) {
  const rate = provider.feeRate === null ? '—' : formatPercent(provider.feeRate, 2);
  const stats = [
    { label: 'Amount Spent', value: formatCurrency(provider.amountSpent) },
    { label: 'Provider Fee', value: formatCurrency(provider.providerFee) },
    { label: 'Total w/ Fee', value: formatCurrency(provider.totalWithFee) },
  ];

  return (
    <section className="rounded-xl border border-line border-l-[3px] border-l-violet bg-surface px-6 py-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="truncate text-lg font-bold text-ink">{provider.name}</h3>
        <span className="shrink-0 rounded-full bg-violet/15 px-3 py-1 text-xs font-bold text-violet">
          {provider.feeRate === null ? 'no spend' : `${rate} fee`}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dd className="truncate text-xl font-bold tabular-nums text-ink">{s.value}</dd>
            <dt className="mt-1 text-xs text-ink-2">{s.label}</dt>
          </div>
        ))}
      </dl>

      <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-ink-3">
        Provider Fee = Amount Spent × {provider.feeRate === null ? 'fee rate' : rate} · Total = Amount Spent + Provider Fee
      </p>
    </section>
  );
}
