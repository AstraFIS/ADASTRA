import BarChart from '@/components/BarChart';
import { formatInteger } from '@/lib/format';
import type { AudienceBucket } from '@/types/facebook';

interface Props {
  title: string;
  caption?: string;
  buckets: AudienceBucket[];
  color: string;
  /** The data has loaded and there is nothing to chart (as opposed to still loading). */
  empty?: boolean;
  emptyText?: string;
  height?: number;
  /** Tighter padding and a chart that stretches to fill the card (use inside an equal-height grid row). */
  compact?: boolean;
}

/** Link clicks per audience bucket (age or gender) as a single-series bar chart. */
export default function AudienceCard({
  title,
  caption,
  buckets,
  color,
  empty = false,
  emptyText = 'No audience rows in the database for this selection yet.',
  height = 250,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-3">{caption ? `Link clicks · ${caption}` : 'Link clicks'}</p>
        {empty || buckets.length === 0 ? (
          <div className="flex min-h-[200px] flex-1 items-center justify-center text-center text-sm text-ink-3">
            {empty ? emptyText : 'Loading…'}
          </div>
        ) : (
          <BarChart
            className="mt-3 min-h-[220px] flex-1"
            ariaLabel={`${title} (link clicks)`}
            categories={buckets.map((b) => b.label)}
            series={[{ key: 'clicks', label: 'Link clicks', color, values: buckets.map((b) => b.value) }]}
            formatValue={(v) => String(Math.round(v))}
            formatTooltipValue={formatInteger}
            intervals={3}
            headroom={1.2}
            barMaxWidth={56}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {caption && <p className="text-sm text-ink-2">{caption}</p>}
      </div>
      {empty || buckets.length === 0 ? (
        <div className="flex items-center justify-center text-center text-sm text-ink-3" style={{ height }}>
          {empty ? emptyText : 'Loading…'}
        </div>
      ) : (
        <BarChart
          className="mt-4"
          height={height}
          ariaLabel={`${title} (link clicks)`}
          categories={buckets.map((b) => b.label)}
          series={[{ key: 'clicks', label: 'Link clicks', color, values: buckets.map((b) => b.value) }]}
          formatValue={(v) => String(Math.round(v))}
          formatTooltipValue={formatInteger}
          intervals={3}
          headroom={1.2}
          barMaxWidth={150}
        />
      )}
    </div>
  );
}
