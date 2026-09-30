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
}: Props) {
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
