import { useMemo, useState } from 'react';
import DevicePieCard from '@/components/DevicePieCard';
import SegmentCard, { type SegmentCardMetric } from '@/components/SegmentCard';
import { formatCurrency, formatDayMonth, formatInteger } from '@/lib/format';
import type { BingClickRow, BingSegment } from '@/types/bing';

type Stage = BingClickRow['event_stage'];

interface BingEventMetric extends SegmentCardMetric {
  key: keyof BingSegment & string;
  /** Which events the Click ID table lists for this choice; null = rows with revenue. */
  stage: Stage | null;
}

/** The partner events the section can be switched between (one shared choice for all three cards). */
const EVENTS: BingEventMetric[] = [
  { key: 'first_page_views', label: 'First Page View', stage: 'first_page_view' },
  { key: 'questionnaire_starts', label: 'Quiz Start', stage: 'questionnaire_start' },
  { key: 'questionnaire_completed', label: 'Quiz Completed', stage: 'questionnaire_completed' },
  { key: 'leads', label: 'Lead', stage: 'lead' },
  { key: 'add_to_carts', label: 'Add To Cart', stage: 'add_to_cart' },
  { key: 'purchase_events', label: 'Purchase', stage: 'purchase' },
  { key: 'revenue_usd', label: 'Revenue', stage: null, money: true },
];

const shortOffer = (o: string) => o.split(' - ')[0]!.trim();

interface Props {
  bySegment: { by_region: BingSegment[]; by_device: BingSegment[] };
  clicks: BingClickRow[];
  /** Small text on the right of each card, e.g. "All Time · all offers". */
  caption: string;
  busy?: boolean;
}

/**
 * Bing "Country / Region & Device": one event filter that switches the region chart,
 * the device chart and the Click ID table together (same layout as the Facebook page).
 */
export default function BingGeoSection({ bySegment, clicks, caption, busy = false }: Props) {
  const [eventKey, setEventKey] = useState<BingEventMetric['key']>('first_page_views');
  const metric = EVENTS.find((e) => e.key === eventKey) ?? EVENTS[0]!;
  const empty = bySegment.by_region.length === 0 && bySegment.by_device.length === 0;

  // users per device = distinct click ids that had the selected event
  const deviceUsers = useMemo(() => {
    const byDevice = new Map<string, Set<string>>();
    for (const c of clicks) {
      if (metric.stage ? c.event_stage !== metric.stage : c.revenue_usd <= 0) continue;
      const d = c.device ?? 'Unknown';
      byDevice.set(d, (byDevice.get(d) ?? new Set<string>()).add(c.sub_id));
    }
    return [...byDevice].map(([label, ids]) => ({ label, value: ids.size }));
  }, [clicks, metric.stage]);

  return (
    <section aria-labelledby="bing-geo-heading" aria-busy={busy} className={`space-y-3 transition-opacity ${busy ? 'opacity-70' : ''}`}>
      <div className="rounded-xl border border-azure/30 bg-surface-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="bing-geo-heading" className="text-base font-bold text-ink">
              Country / Region, Device &amp; Click IDs
            </h2>
            <p className="text-xs text-ink-2">Pick an event — the region chart, the device pie and the Click ID table update together.</p>
          </div>
          <div role="group" aria-label="Event for the region, device and click id views" className="flex flex-wrap gap-2">
            {EVENTS.map((e) => {
              const active = e.key === eventKey;
              return (
                <button
                  key={e.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setEventKey(e.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                    active ? 'border-azure bg-azure text-canvas' : 'border-line-strong bg-surface text-ink-2 hover:border-azure hover:text-ink'
                  }`}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SegmentCard
          title="Users by Country / Region"
          caption={caption}
          segments={bySegment.by_region}
          metric={metric}
          color="var(--color-revenue)"
          chartLimit={8}
          hideZero
          empty={empty}
          emptyText="No partner events for this selection."
        />
        <DevicePieCard
          title="Users by Device"
          caption={caption}
          subtitle={`${metric.label} · unique users (click IDs)`}
          slices={deviceUsers}
          emptyText={empty ? 'No partner events for this selection.' : `No ${metric.label.toLowerCase()} in this selection.`}
        />
        <ClickIdTable clicks={clicks} metric={metric} caption={caption} />
      </div>
    </section>
  );
}

function ClickIdTable({ clicks, metric, caption }: { clicks: BingClickRow[]; metric: BingEventMetric; caption: string }) {
  const [copied, setCopied] = useState(false);
  const rows = useMemo(
    () => (metric.stage ? clicks.filter((c) => c.event_stage === metric.stage) : clicks.filter((c) => c.revenue_usd > 0)),
    [clicks, metric.stage],
  );
  const ids = useMemo(() => [...new Set(rows.map((r) => r.sub_id))], [rows]);

  async function copyIds() {
    try {
      await navigator.clipboard.writeText(ids.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (e.g. insecure context): nothing else to do
    }
  }

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 md:col-span-2 xl:col-span-1">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">Click IDs</h2>
        <p className="text-xs text-ink-2">{caption}</p>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-3">
          {metric.label} · {formatInteger(rows.length)} event{rows.length === 1 ? '' : 's'} · {formatInteger(ids.length)} click ID
          {ids.length === 1 ? '' : 's'}
        </p>
        {ids.length > 0 && (
          <button
            type="button"
            onClick={copyIds}
            className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold text-azure hover:bg-line"
            title="Copy the click IDs, one per line"
          >
            {copied ? 'Copied ✓' : 'Copy IDs'}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex h-[236px] items-center justify-center text-center text-sm text-ink-3">
          No {metric.label.toLowerCase()} events in this selection.
        </div>
      ) : (
        <div className="mt-2 h-[236px] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
                <th scope="col" className="py-1.5 pr-2 font-medium">Click ID</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Date</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Offer</th>
                <th scope="col" className="py-1.5 pr-2 font-medium">Region · Device</th>
                <th scope="col" className="py-1.5 text-right font-medium">Rev.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.sub_id}-${r.offer_name}-${r.event_raw}-${i}`}
                  className="border-t border-line/60 hover:bg-surface-2/60"
                  title={[
                    `Click ID: ${r.sub_id}`,
                    `Event: ${r.event_raw}`,
                    `Offer: ${r.offer_name}`,
                    r.campaign_name ? `Campaign: ${r.campaign_name} · ${r.ad_group_name ?? ''}` : 'Campaign: not sent by partner',
                  ].join('\n')}
                >
                  <td className="max-w-[120px] truncate py-1.5 pr-2 font-mono text-[11px] text-ink">
                    {r.sub_id.startsWith('anon-') ? <span className="italic text-ink-3">no click ID</span> : r.sub_id}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-ink-2">{formatDayMonth(r.date)}</td>
                  <td className="max-w-[90px] truncate py-1.5 pr-2 text-ink-2">{shortOffer(r.offer_name)}</td>
                  <td className="max-w-[120px] truncate py-1.5 pr-2 text-ink-2">
                    {[r.region, r.device].filter(Boolean).join(' · ') || <span className="text-ink-3">—</span>}
                  </td>
                  <td className={`whitespace-nowrap py-1.5 text-right tabular-nums ${r.revenue_usd ? 'font-bold text-revenue' : 'text-ink-3'}`}>
                    {r.revenue_usd ? formatCurrency(r.revenue_usd, { whole: true }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
