import { CreativeMedia, LandingPageLink } from '@/components/CreativeMedia';
import { formatPercent } from '@/lib/format';
import type { ReadStatus } from '@/types/facebook';
import type { AdCreative } from '@/lib/creatives';
import type { AdRecommendation } from '@/types/fbAdStatistics';

const STATUS_CLASSES: Record<ReadStatus, string> = {
  scale: 'border-revenue/60 bg-revenue/10 text-revenue',
  monitor: 'border-spend/60 bg-spend/10 text-spend',
  review: 'border-loss/60 bg-loss/10 text-loss',
  low_sample: 'border-line-strong bg-surface-2 text-ink-2',
  no_data: 'border-line-strong bg-surface-2 text-ink-3',
};

interface Props {
  adName: string;
  creative: AdCreative;
  recommendation: AdRecommendation;
  /** Net ROAS as a percentage number (e.g. −22.2), null when nothing was spent. */
  roas: number | null;
}

/** The ad's creative next to the rule-based read of its numbers: status, summary, next steps and test plan. */
export default function CreativeRecommendationCard({ adName, creative, recommendation: rec, roas }: Props) {
  const kind = creative.video_url ? 'Video ad' : creative.image_url ? 'Static image ad' : null;
  const plan = rec.test_plan;

  return (
    <section aria-labelledby="creative-heading" className="rounded-xl border border-line bg-surface p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="creative-heading" className="text-lg font-bold text-ink">
          Creative &amp; Recommendation
        </h2>
        {kind && <p className="text-sm text-ink-3">{kind}</p>}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col items-center gap-5">
          <div className="w-full max-w-[450px]">
            {/* keyed so the failed flag resets when the ad (and its media) changes */}
            <CreativeMedia key={`${creative.video_url}|${creative.image_url}`} adName={adName} creative={creative} />
          </div>
          <LandingPageLink url={creative.landing_page_url} />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-4 py-1 text-sm font-bold ${STATUS_CLASSES[rec.status]}`}>
              {rec.status_label}
            </span>
            {roas !== null && (
              <span className={`text-base font-bold ${roas < 0 ? 'text-loss' : 'text-revenue'}`}>
                ROAS {formatPercent(roas / 100, 1)}
              </span>
            )}
          </div>

          <p className="mt-4 text-base leading-relaxed text-ink">{rec.summary}</p>

          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink marker:text-ink-2">
            {rec.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>

          {plan && (
            <div className="mt-5 border-t border-line pt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-ink">Test plan</h3>
              <dl className="mt-3 space-y-1.5 text-sm text-ink-2">
                <div>
                  <dt className="inline font-bold">Budget: </dt>
                  <dd className="inline">{plan.budget}</dd>
                </div>
                <div>
                  <dt className="inline font-bold">Increase: </dt>
                  <dd className="inline">{plan.increase}</dd>
                </div>
                <div>
                  <dt className="inline font-bold">Decrease: </dt>
                  <dd className="inline">{plan.decrease}</dd>
                </div>
                <div className="pt-1.5">
                  <dt className="inline font-bold text-loss">Stop rule: </dt>
                  <dd className="inline">{plan.stop_rule}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
