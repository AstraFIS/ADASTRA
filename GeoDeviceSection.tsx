import { useState } from 'react';
import SegmentCard from '@/components/SegmentCard';
import { SEGMENT_METRICS, type SegmentMetricKey } from '@/lib/segmentMetrics';
import type { FbGeoDeviceResult } from '@/types/fbGeoDevice';

interface Props {
  /** Latest loaded data (may be the previous result while a new one loads). */
  data: FbGeoDeviceResult | null;
  busy?: boolean;
  error?: string | null;
  /** Small text on the right of each card, e.g. "All ads · this month". */
  caption?: string;
  id?: string;
}

/**
 * "Country / Region & Device": one button bar that switches both charts to the same
 * funnel stage at once. The choice lives here, so it only affects these two charts.
 */
export default function GeoDeviceSection({ data, busy = false, error = null, caption, id = 'geo-heading' }: Props) {
  const [metricKey, setMetricKey] = useState<SegmentMetricKey>('first_page_views');
  const metric = SEGMENT_METRICS.find((m) => m.key === metricKey) ?? SEGMENT_METRICS[0]!;
  const empty = data !== null && data.meta.report_rows === 0;

  return (
    <section
      aria-labelledby={id}
      aria-busy={busy}
      className={`space-y-3 transition-opacity ${busy ? 'opacity-70' : ''}`}
    >
      <div className="rounded-xl border border-revenue/30 bg-surface-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id={id} className="text-base font-bold text-ink">
              Country / Region &amp; Device
            </h2>
            <p className="text-xs text-ink-2">Pick a funnel stage — both charts below update together.</p>
          </div>
          <div role="group" aria-label="Funnel stage for the country and device charts" className="flex flex-wrap gap-2">
            {SEGMENT_METRICS.map((m) => {
              const active = m.key === metricKey;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMetricKey(m.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                    active
                      ? 'border-revenue bg-revenue text-canvas'
                      : 'border-line-strong bg-surface text-ink-2 hover:border-revenue hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-line bg-surface p-4 text-sm text-loss">
          Country / device data unavailable: {error}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <SegmentCard
            title="Users by Country / Region"
            caption={caption}
            segments={data?.by_region ?? []}
            metric={metric}
            color="var(--color-revenue)"
            empty={empty}
          />
          <SegmentCard
            title="Users by Device"
            caption={caption}
            segments={data?.by_device ?? []}
            metric={metric}
            color="var(--color-spend)"
            empty={empty}
          />
        </div>
      )}
    </section>
  );
}
