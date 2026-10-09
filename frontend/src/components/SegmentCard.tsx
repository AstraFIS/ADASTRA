import BarChart from '@/components/BarChart';
import { formatCompactCurrency, formatCurrency, formatInteger } from '@/lib/format';
/** Any region / device row: Facebook's SegmentStat, Bing's BingSegment, … */
export interface SegmentLike {
  key: string;
  label: string;
}

/** The value to chart: a numeric field of the segment, named by `key`. */
export interface SegmentCardMetric {
  key: string;
  label: string;
  money?: boolean;
}

const isUnknown = (s: SegmentLike) => s.key === 'unknown';

interface Props<T extends SegmentLike> {
  title: string;
  caption?: string;
  segments: T[];
  /** The funnel stage to chart; chosen by the shared button bar above the cards. */
  metric: SegmentCardMetric;
  color: string;
  /** Show only this many segments (the rest are summarised in a note). */
  chartLimit?: number;
  /** The data has loaded and there is nothing to show (as opposed to still loading). */
  empty?: boolean;
  emptyText?: string;
  height?: number;
  /** Leave out segments whose value is 0 for the selected metric. */
  hideZero?: boolean;
}

/** One breakdown (region or device) as a single bar chart for the selected metric. */
export default function SegmentCard<T extends SegmentLike>({
  title,
  caption,
  segments,
  metric,
  color,
  chartLimit = 10,
  empty = false,
  emptyText = 'No rows in the database for this selection yet.',
  height = 220,
  hideZero = false,
}: Props<T>) {
  const value = (s: T) => Number((s as unknown as Record<string, unknown>)[metric.key]) || 0;
  // biggest first, "Unknown" always last
  const ranked = [...segments].filter((s) => !hideZero || value(s) !== 0).sort((a, b) => Number(isUnknown(a)) - Number(isUnknown(b)) || value(b) - value(a));
  const shown = ranked.slice(0, chartLimit);
  const total = segments.reduce((n, s) => n + value(s), 0);
  // counts get whole-number gridlines (0 · 1 · 2 · 3, not 0.4 · 0.8 · 1.2); money keeps the default scale
  const top = Math.max(0, ...shown.map(value));
  const step = Math.max(1, Math.ceil((top * 1.2) / 3));
  const axis = metric.money || top === 0 ? { intervals: 3, headroom: 1.2 } : { intervals: 3, headroom: (step * 3) / top };
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

      {empty || segments.length === 0 || shown.length === 0 ? (
        <div className="flex items-center justify-center text-center text-sm text-ink-3" style={{ height }}>
          {empty ? emptyText : segments.length === 0 ? 'Loading…' : `No ${metric.label.toLowerCase()} in this selection.`}
        </div>
      ) : (
        <>
          <BarChart
            className="mt-2"
            height={height}
            ariaLabel={`${title} (${metric.label})`}
            categories={shown.map((s) => s.label)}
            series={[{ key: metric.key, label: metric.label, color, values: shown.map(value) }]}
            formatValue={metric.money ? formatCompactCurrency : (v) => String(Math.round(v))}
            formatTooltipValue={fmt}
            formatTick={metric.money ? formatCompactCurrency : (v) => String(Math.round(v))}
            intervals={axis.intervals}
            headroom={axis.headroom}
            barMaxWidth={90}
          />
          {ranked.length > chartLimit && (
            <p className="mt-1 text-xs text-ink-3">
              Showing the top {chartLimit} of {ranked.length}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
