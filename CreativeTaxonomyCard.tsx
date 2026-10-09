import { CreativeMedia, LandingPageLink } from '@/components/CreativeMedia';
import type { AdCreative } from '@/lib/creatives';
import { formatPercent } from '@/lib/format';
import type { CreativeTaxonomy, TaxonomyField } from '@/types/facebook';

const DEFAULT_FLOOR = 0.7;

function FieldRow({ field, floor }: { field: TaxonomyField; floor: number }) {
  const low = field.confidence !== null && field.confidence < floor;
  return (
    <li className="border-b border-line py-1.5 text-[13px] last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-2">{field.label}</span>
        <span
          className={`shrink-0 text-xs ${low ? 'font-semibold text-spend' : 'text-ink-3'}`}
          aria-label={field.confidence === null ? 'no confidence score' : undefined}
        >
          {field.confidence === null ? '' : `${formatPercent(field.confidence, 0)} confidence`}
        </span>
      </div>
      <p className="mt-0.5 break-words text-ink">{field.value || '—'}</p>
    </li>
  );
}

function Column({ heading, fields, floor }: { heading: string; fields: TaxonomyField[]; floor: number }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-ink-2">{heading}</h3>
      <ul className="mt-1">
        {fields.map((f) => (
          <FieldRow key={f.key} field={f} floor={floor} />
        ))}
      </ul>
    </div>
  );
}

export default function CreativeTaxonomyCard({
  taxonomy,
  threshold = DEFAULT_FLOOR,
  adName = '',
  creative = null,
}: {
  taxonomy: CreativeTaxonomy | null;
  /** The ad's name and creative, shown in the middle between the two columns. */
  adName?: string;
  creative?: AdCreative | null;
  /** Confidence below this (0–1) is flagged; defaults to 70 %. */
  threshold?: number;
}) {
  if (!taxonomy) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-base font-bold text-ink">Creative Taxonomy</h2>
        <p className="mt-2 text-sm text-ink-3">No creative classification is available for this ad yet.</p>
        {creative && (
          <div className="mx-auto mt-6 flex max-w-[340px] flex-col items-center gap-5">
            <div className="w-full">
              <CreativeMedia key={`${creative.video_url}|${creative.image_url}`} adName={adName} creative={creative} />
            </div>
            <LandingPageLink url={creative.landing_page_url} />
          </div>
        )}
      </section>
    );
  }

  const scored = [...taxonomy.intention, ...taxonomy.execution].filter((f) => f.confidence !== null);
  const lowCount = scored.filter((f) => (f.confidence ?? 1) < threshold).length;
  const summary =
    lowCount === 0
      ? `All fields above ${formatPercent(threshold, 0)} confidence`
      : `${lowCount} field${lowCount === 1 ? '' : 's'} below ${formatPercent(threshold, 0)} confidence`;

  return (
    <section aria-labelledby="taxonomy-heading" className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="taxonomy-heading" className="text-base font-bold text-ink">
          Creative Taxonomy
        </h2>
        <p className={`text-xs ${lowCount > 0 ? 'text-spend' : 'text-ink-2'}`}>{summary}</p>
      </div>

      <div
        className={`mt-3 grid gap-x-6 gap-y-5 ${creative ? 'lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)_minmax(0,1fr)]' : 'lg:grid-cols-2'}`}
      >
        <Column heading="Intention / Message" fields={taxonomy.intention} floor={threshold} />
        {creative && (
          <div className="order-first flex flex-col items-center gap-5 lg:order-none">
            {/* keyed so the failed flag resets when the ad (and its media) changes */}
            <div className="w-full">
              <CreativeMedia key={`${creative.video_url}|${creative.image_url}`} adName={adName} creative={creative} />
            </div>
            <LandingPageLink url={creative.landing_page_url} />
          </div>
        )}
        <Column heading="Physical / Execution" fields={taxonomy.execution} floor={threshold} />
      </div>

      <p className="mt-3 text-xs text-ink-3">
        Taxonomy Version: {taxonomy.version} · {taxonomy.source}
      </p>
    </section>
  );
}
