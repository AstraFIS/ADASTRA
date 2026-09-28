import { Link } from 'react-router-dom';
import { formatCurrency, formatInteger } from '@/lib/format';
import { PLATFORM_ICONS, type PlatformSummary } from '@/types/platforms';

interface Props {
  platform: PlatformSummary;
}

export default function PlatformCard({ platform }: Props) {
  const icon = PLATFORM_ICONS[platform.id];

  if (!platform.connected || !platform.metrics) {
    return (
      <section className="flex flex-col rounded-xl border border-line bg-surface p-7">
        <div className="flex items-start justify-between gap-4">
          <h3 className="flex items-center gap-3 text-xl font-bold text-ink-3">
            <span aria-hidden="true" className="opacity-60">{icon}</span>
            {platform.name}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-ink-3">
            <span aria-hidden="true">🔒</span>
            Not yet connected
          </span>
        </div>

        <div className="hatch mt-7 flex h-40 items-center justify-center rounded-lg">
          <span className="rounded bg-surface/90 px-3 py-1 text-sm text-ink-3">
            No data connection yet
          </span>
        </div>

        <button
          type="button"
          disabled
          className="mt-6 w-full cursor-not-allowed rounded-lg border border-line bg-surface-2 py-3 text-base font-semibold text-ink-3"
        >
          Coming Soon
        </button>
      </section>
    );
  }

  const m = platform.metrics;
  const rows: { label: string; value: string }[] = [
    { label: 'Total Spend', value: formatCurrency(m.spend) },
    { label: 'Total Revenue', value: formatCurrency(m.revenue) },
    { label: 'Net Profit', value: formatCurrency(m.netProfit) },
    { label: 'Active Ads', value: formatInteger(m.activeAds) },
  ];

  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface p-7">
      <h3 className="flex items-center gap-3 text-xl font-bold text-ink">
        <span aria-hidden="true">{icon}</span>
        {platform.name}
      </h3>

      <dl className="mt-6 flex-1 space-y-2 pb-8 text-base">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-1.5">
            <dt className="text-ink-2">{row.label}:</dt>
            <dd className="font-bold tabular-nums text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      <Link
        to={`/platforms/${platform.id}`}
        className="block w-full rounded-lg bg-revenue py-3 text-center text-base font-bold text-canvas transition-colors hover:brightness-110"
      >
        Open Full {platform.name} Dashboard →
      </Link>
    </section>
  );
}
