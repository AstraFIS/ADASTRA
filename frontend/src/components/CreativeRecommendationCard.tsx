import { useState } from 'react';
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

const pill = 'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold';
// keeps its own aspect ratio; a tall (9:16) creative is capped so it does not stretch the card
const media = 'mx-auto block max-h-[520px] w-auto max-w-full rounded-lg bg-canvas';

function CreativeMedia({ adName, creative }: { adName: string; creative: AdCreative }) {
  // a stored URL can still be dead; fall back to the placeholder instead of a broken image
  const [failed, setFailed] = useState(false);

  if (creative.video_url && !failed) {
    return (
      <video
        controls
        preload="metadata"
        poster={creative.image_url ?? undefined}
        src={creative.video_url}
        onError={() => setFailed(true)}
        aria-label={`Video creative for ${adName}`}
        className={media}
      />
    );
  }
  if (creative.image_url && !failed) {
    return (
      <img
        src={creative.image_url}
        alt={`Creative for ${adName}`}
        onError={() => setFailed(true)}
        className={media}
      />
    );
  }
  return (
    <div className="hatch flex aspect-square w-full items-center justify-center rounded-lg border border-line">
      <span className="rounded bg-surface/90 px-3 py-1 text-sm text-ink-3">
        {failed ? 'The creative could not be loaded' : 'No creative stored for this ad yet'}
      </span>
    </div>
  );
}

function LandingPageLink({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span
        aria-disabled="true"
        title="No landing page URL is stored for this ad yet"
        className={`${pill} cursor-not-allowed border-line bg-surface-2 text-ink-3`}
      >
        <span aria-hidden="true">🔗</span>
        Open landing page
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${pill} border-revenue/40 bg-revenue/10 text-revenue transition-colors hover:bg-revenue/20`}
    >
      <span aria-hidden="true">🔗</span>
      Open landing page
      <span aria-hidden="true">↗</span>
    </a>
  );
}

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
