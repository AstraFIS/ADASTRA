import type { ReadStatus } from '../types/facebook.js';
import { formatCurrency, formatPercent } from '../utils/format.js';
import { LOW_SAMPLE_CLICKS, REVIEW_ROAS, SCALE_ROAS } from './facebook.service.js';
import type { AdStatistics } from './fbAdStatistics.service.js';

export interface AdTestPlan {
  budget: string;
  increase: string;
  decrease: string;
  stop_rule: string;
}

/** The "Creative & Recommendation" card: a deterministic read of one ad's numbers for the selected range. */
export interface AdRecommendation {
  status: ReadStatus;
  status_label: string;
  summary: string;
  actions: string[];
  /** null when there is too little data to plan around. */
  test_plan: AdTestPlan | null;
}

/** The ad's most recent spending day in the range, and its ROAS over the days before it. */
export interface LatestSpendDay {
  date: string; // YYYY-MM-DD
  spend: number; // incl. provider fees
  conversions: number;
  roas_before: number | null; // %, null when nothing was spent earlier in the range
}

type RecommendationInput = Pick<
  AdStatistics,
  'amount_spent' | 'revenue' | 'conversions' | 'cac' | 'roas' | 'link_clicks'
>;

// the statistics carry ROAS as a percentage; the shared thresholds are fractions
const SCALE_PCT = SCALE_ROAS * 100;
const REVIEW_PCT = REVIEW_ROAS * 100;

const pct = (value: number) => formatPercent(value / 100, 1);
const SCALE_AT = formatPercent(SCALE_ROAS, 0); // "25%"
const REVIEW_AT = formatPercent(REVIEW_ROAS, 0); // "−25%"
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const shortDay = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

const SCALE_LINE = `+${SCALE_AT} Scale line`;
const REVIEW_LINE = `${REVIEW_AT} Review line`;

/** "It spent $257.00 on Sep 24 with no new sale, so ROAS slipped from −14.6% to −22.2%." */
function latestDaySentence(roas: number, latest: LatestSpendDay | null): string | null {
  if (!latest || latest.roas_before === null) return null;
  const before = pct(latest.roas_before);
  const now = pct(roas);
  if (before === now) return null;
  const day = shortDay(latest.date);
  const verb = roas < latest.roas_before ? 'slipped' : 'rose';
  return latest.conversions === 0
    ? `It spent ${formatCurrency(latest.spend)} on ${day} with no new sale, so ROAS ${verb} from ${before} to ${now}.`
    : `On ${day} it spent ${formatCurrency(latest.spend)} for ${plural(latest.conversions, 'conversion')}, and ROAS ${verb} from ${before} to ${now}.`;
}

/**
 * Same rules as the seed marketing read (buildRead in facebook.service.ts),
 * applied to the report collection: under 10 link clicks → Low sample; net
 * ROAS ≥ 25 % → Scale; between −25 % and 25 % → Monitor; ≤ −25 % → Review.
 */
export function buildRecommendation(s: RecommendationInput, latest: LatestSpendDay | null): AdRecommendation {
  if (s.amount_spent <= 0 && s.link_clicks === 0) {
    return {
      status: 'no_data',
      status_label: 'No data',
      summary: 'No spend or clicks were recorded for this ad in the selected period.',
      actions: ['Pick a wider date range, or confirm the ad was live during this period.'],
      test_plan: null,
    };
  }

  const spend = formatCurrency(s.amount_spent);

  if (s.link_clicks < LOW_SAMPLE_CLICKS) {
    return {
      status: 'low_sample',
      status_label: 'Low sample',
      summary: `${spend} spent for ${plural(s.link_clicks, 'link click')} — too few to judge performance reliably.`,
      actions: [
        `Let the ad gather at least ${LOW_SAMPLE_CLICKS} link clicks, or widen the date range.`,
        'Hold off on scaling or cutting until there is enough data to act on.',
      ],
      test_plan: null,
    };
  }

  const roas = s.roas ?? 0;
  const verdict =
    roas >= SCALE_PCT
      ? 'clearly profitable relative to spend'
      : roas >= 0
        ? 'currently profitable relative to spend'
        : roas > REVIEW_PCT
          ? 'slightly unprofitable relative to spend'
          : 'losing money relative to spend';
  const summary = [
    s.cac === null
      ? `${spend} spent, ${formatCurrency(s.revenue)} revenue and no conversions yet, so there is no CAC to judge.`
      : `${spend} spent, ${formatCurrency(s.revenue)} revenue, ${plural(s.conversions, 'conversion')} — CAC is ${formatCurrency(s.cac)}.`,
    latestDaySentence(roas, latest),
    `Net ROAS of ${pct(roas)} is ${verdict}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const stopRule = `If ROAS drops below ${REVIEW_AT}, move to Review.`;

  if (roas >= SCALE_PCT) {
    return {
      status: 'scale',
      status_label: 'Scale',
      summary,
      actions: [
        `Increase the daily budget in 20–30% steps — ROAS is above the ${SCALE_LINE}.`,
        'Watch CAC and CTR for decay as spend rises.',
        'Keep this creative running and use it as the baseline for new variations.',
      ],
      test_plan: {
        budget: 'Raise in 20–30% steps',
        increase: `While ROAS stays above ${SCALE_AT}`,
        decrease: `Step back to the previous level if ROAS falls below ${SCALE_AT}`,
        stop_rule: stopRule,
      },
    };
  }

  if (roas > REVIEW_PCT) {
    return {
      status: 'monitor',
      status_label: 'Monitor',
      summary,
      actions: [
        `Hold spend flat for now — ROAS is between the ${REVIEW_LINE} and the ${SCALE_LINE}.`,
        'Test a creative or targeting variation before committing more budget.',
        roas < 0
          ? `If ROAS falls below ${REVIEW_AT}, cut the daily budget.`
          : `Scale only once ROAS holds above ${SCALE_AT}.`,
      ],
      test_plan: {
        budget: 'Hold at current daily level',
        increase: `None until ROAS holds above ${SCALE_AT}`,
        decrease: `Cut once ROAS falls below ${REVIEW_AT}`,
        stop_rule: stopRule,
      },
    };
  }

  return {
    status: 'review',
    status_label: 'Review',
    summary,
    actions: [
      `Cut or pause spend — ROAS is below the ${REVIEW_LINE}.`,
      'Check the funnel drop-off for a stage that can be fixed before spending more.',
      'Redirect the budget to ads with a positive net return.',
    ],
    test_plan: {
      budget: 'Cut or pause',
      increase: 'None',
      decrease: `Now — ROAS is below ${REVIEW_AT}`,
      stop_rule: `Pause unless ROAS recovers above ${REVIEW_AT}.`,
    },
  };
}
