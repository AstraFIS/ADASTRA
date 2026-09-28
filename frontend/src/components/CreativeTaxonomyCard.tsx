import { formatPercent } from '@/lib/format';
import type { CreativeTaxonomy, TaxonomyField } from '@/types/facebook';

const CONFIDENCE_FLOOR = 0.7;

function FieldRow({ field }: { field: TaxonomyField }) {
  const low = field.confidence !== null && field.confidence < CONFIDENCE_FLOOR;
  return (
    <li className="flex items-baseline gap-4 border-b border-line py-2.5 text-sm last:border-b-0">
      <span className="w-36 shrink-0 text-ink-2">{field.label}</span>
      <span className="min-w-0 flex-1 text-right text-ink">{field.value}</span>
      <span
        className={`w-28 shrink-0 text-right text-xs ${low ? 'font-semibold text-spend' : 'text-ink-3'}`}
        aria-label={field.confidence === null ? 'no confidence score' : undefined}
      >
        {field.confidence === null ? '' : `${formatPercent(field.confidence, 0)} confidence`}
      </span>
    </li>
  );
}

function Column({ heading, fields }: { heading: string; fields: TaxonomyField[] }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-ink-2">{heading}</h3>
      <ul className="mt-2">
        {fields.map((f) => (
          <FieldRow key={f.key} field={f} />
        ))}
      </ul>
    </div>
  );
}

export default function CreativeTaxonomyCard({ taxonomy }: { taxonomy: CreativeTaxonomy | null }) {
  if (!taxonomy) {
    return (
      <section className="rounded-xl border border-line bg-surface p-7">
        <h2 className="text-lg font-bold text-ink">Creative Taxonomy</h2>
        <p className="mt-4 text-sm text-ink-3">No creative classification is available for this ad yet.</p>
      </section>
    );
  }

  const scored = [...taxonomy.intention, ...taxonomy.execution].filter((f) => f.confidence !== null);
  const lowCount = scored.filter((f) => (f.confidence ?? 1) < CONFIDENCE_FLOOR).length;
  const summary =
    lowCount === 0
      ? `All fields above ${formatPercent(CONFIDENCE_FLOOR, 0)} confidence`
      : `${lowCount} field${lowCount === 1 ? '' : 's'} below ${formatPercent(CONFIDENCE_FLOOR, 0)} confidence`;

  return (
    <section aria-labelledby="taxonomy-heading" className="rounded-xl border border-line bg-surface p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="taxonomy-heading" className="text-lg font-bold text-ink">
          Creative Taxonomy
        </h2>
        <p className={`text-sm ${lowCount > 0 ? 'text-spend' : 'text-ink-2'}`}>{summary}</p>
      </div>

      <div className="mt-5 grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <Column heading="Intention / Message" fields={taxonomy.intention} />
        <Column heading="Physical / Execution" fields={taxonomy.execution} />
      </div>

      <p className="mt-6 text-sm text-ink-3">
        Taxonomy Version: {taxonomy.version} · {taxonomy.source}
      </p>
    </section>
  );
}
