import BarChart from '@/components/BarChart';
import { formatCompactCurrency, formatCurrency, formatInteger } from '@/lib/format';
import type { SegmentMetric } from '@/lib/segmentMetrics';
import type { SegmentStat } from '@/types/fbGeoDevice';

const isUnknown = (s: SegmentStat) => s.key === 'unknown';

interface Props {
  title: string;
  caption?: string;
  segments: SegmentStat[];
  /** The funnel stage to chart; chosen by the shared button bar above the cards. */
  metric: SegmentMetric;
  color: string;
  /** Show only this many segments (the rest are summarised in a note). */
  chartLimit?: number;
  /** The data has loaded and there is nothing to show (as opposed to still loading). */
  empty?: boolean;
  emptyText?: string;
  height?: number;
}

/** One breakdown (region or device) as a single bar chart for the selected metric. */
export default function SegmentCard({
  title,
  caption,
  segments,
  metric,
  color,
  chartLimit = 10,
  empty = false,
  emptyText = 'No rows in the database for this selection yet.',
  height = 220,
}: Props) {
  // biggest first, "Unknown" always last
  const ranked = [...segments].sort(
    (a, b) => Number(isUnknown(a)) - Number(isUnknown(b)) || b[metric.key] - a[metric.key],
  );
  const shown = ranked.slice(0, chartLimit);
  const total = segments.reduce((n, s) => n + s[metric.key], 0);
  const fmt = (v: number) => (metric.money ? formatCurrency(v) : formatInteger(v));

  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {caption && <p className="text-xs text-ink-2">{caption}</p>}
      </div>
      <p className="mt-0.5 text-xs text-ink-3">
        {metric.label}
        {!empty && segments.length > 0 && <> · total {fmt(total)}</>}
      </p>

      {empty || segments.length === 0 ? (
        <div className="flex items-center justify-center text-center text-sm text-ink-3" style={{ height }}>
          {empty ? emptyText : 'Loading…'}
        </div>
      ) : (
        <>
          <BarChart
            className="mt-2"
            height={height}
            ariaLabel={`${title} (${metric.label})`}
            categories={shown.map((s) => s.label)}
            series={[{ key: metric.key, label: metric.label, color, values: shown.map((s) => s[metric.key]) }]}
            formatValue={metric.money ? formatCompactCurrency : (v) => String(Math.round(v))}
            formatTooltipValue={fmt}
            intervals={3}
            headroom={1.2}
            barMaxWidth={90}
          />
          {segments.length > chartLimit && (
            <p className="mt-1 text-xs text-ink-3">
              Showing the top {chartLimit} of {segments.length}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
