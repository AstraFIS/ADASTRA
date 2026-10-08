import { useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  EXECUTION_KEYS,
  INTENTION_KEYS,
  labelFor,
  type TaxonomyData,
  type TaxonomySource,
  type TaxonomyValue,
} from '@/lib/creativeTaxonomy';

interface Row {
  key: string;
  value: string;
  /** confidence as typed, in percent (0–100); '' = no score */
  conf: string;
}
type Section = 'intention_message' | 'physical_execution';

const LONG_FIELDS = new Set(['claim', 'hook', 'body_copy', 'main_visual', 'offer_text', 'header']);

/** Standard fields first (always shown, so they can be filled in), then any extra fields the data has. */
function toRows(section: Record<string, TaxonomyValue> | undefined, standard: readonly string[]): Row[] {
  const data = section ?? {};
  const keys = [...standard, ...Object.keys(data).filter((k) => !standard.includes(k))];
  return keys.map((key) => {
    const f = data[key];
    return {
      key,
      value: f?.value ?? '',
      conf: typeof f?.confidence === 'number' ? String(Math.round(f.confidence * 100)) : '',
    };
  });
}

function fromRows(rows: Row[]): Record<string, TaxonomyValue> {
  const out: Record<string, TaxonomyValue> = {};
  for (const r of rows) {
    const value = r.value.trim();
    if (value === '' && r.conf.trim() === '') continue; // nothing entered: leave the field out
    const field: TaxonomyValue = { value: value === '' ? null : value };
    if (r.conf.trim() !== '') field.confidence = Math.round(Number(r.conf)) / 100;
    out[r.key] = field;
  }
  return out;
}

const validPercent = (v: string) => v.trim() === '' || (/^\d{1,3}(\.\d+)?$/.test(v.trim()) && Number(v) <= 100);

const inputCls =
  'w-full rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue';

interface Props {
  adName: string;
  /** The taxonomy to start from (saved one, else data.json, else null). */
  initial: TaxonomyData | null;
  /** Whether a saved taxonomy exists that "Remove saved" would delete. */
  hasSaved: boolean;
  aiEnabled: boolean;
  /** Creative image link; the AI needs it. */
  imageUrl: string;
  onClassify: () => Promise<TaxonomyData>;
  onApply: (data: TaxonomyData, source: TaxonomySource) => void;
  onRemoveSaved: () => void;
  onClose: () => void;
}

export default function TaxonomyEditor({
  adName,
  initial,
  hasSaved,
  aiEnabled,
  imageUrl,
  onClassify,
  onApply,
  onRemoveSaved,
  onClose,
}: Props) {
  const [intention, setIntention] = useState<Row[]>(() => toRows(initial?.intention_message, INTENTION_KEYS));
  const [execution, setExecution] = useState<Row[]>(() => toRows(initial?.physical_execution, EXECUTION_KEYS));
  const [threshold, setThreshold] = useState(() =>
    String(Math.round((initial?.confidence_threshold ?? DEFAULT_CONFIDENCE_THRESHOLD) * 100)),
  );
  const [source, setSource] = useState<TaxonomySource>('manual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalid = useMemo(
    () => [...intention, ...execution].some((r) => !validPercent(r.conf)) || !validPercent(threshold) || threshold.trim() === '',
    [intention, execution, threshold],
  );
  const filled = [...intention, ...execution].some((r) => r.value.trim() !== '' || r.conf.trim() !== '');
  const floor = Number(threshold) || 0;

  function edit(section: Section, key: string, patch: Partial<Row>) {
    setSource('manual');
    const update = (rows: Row[]) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
    if (section === 'intention_message') setIntention(update);
    else setExecution(update);
  }

  async function fillWithAi() {
    setBusy(true);
    setError(null);
    try {
      const t = await onClassify();
      setIntention(toRows(t.intention_message, INTENTION_KEYS));
      setExecution(toRows(t.physical_execution, EXECUTION_KEYS));
      setSource('ai');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI classification failed');
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    onApply(
      {
        confidence_threshold: Math.round(Number(threshold)) / 100,
        intention_message: fromRows(intention),
        physical_execution: fromRows(execution),
      },
      source,
    );
  }

  const renderSection = (title: string, section: Section, rows: Row[]) => (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-ink-2">{title}</h3>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => {
          const bad = !validPercent(r.conf);
          const low = !bad && r.conf.trim() !== '' && Number(r.conf) < floor;
          return (
            <li key={r.key} className="grid grid-cols-[7rem_1fr_4.5rem] items-start gap-2">
              <label htmlFor={`${section}-${r.key}`} className="pt-1.5 text-xs text-ink-2">
                {labelFor(r.key)}
              </label>
              {LONG_FIELDS.has(r.key) ? (
                <textarea
                  id={`${section}-${r.key}`}
                  rows={2}
                  value={r.value}
                  onChange={(e) => edit(section, r.key, { value: e.target.value })}
                  className={inputCls}
                />
              ) : (
                <input
                  id={`${section}-${r.key}`}
                  type="text"
                  value={r.value}
                  onChange={(e) => edit(section, r.key, { value: e.target.value })}
                  className={inputCls}
                />
              )}
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={r.conf}
                  onChange={(e) => edit(section, r.key, { conf: e.target.value })}
                  placeholder="—"
                  aria-label={`${labelFor(r.key)} confidence in percent`}
                  aria-invalid={bad}
                  className={`${inputCls} pr-6 text-right ${bad ? 'border-loss' : low ? 'border-spend text-spend' : ''}`}
                />
                <span className="pointer-events-none absolute right-2 top-1.5 text-xs text-ink-3">%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <Modal title={`Creative taxonomy — ${adName}`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3">
        <button
          type="button"
          onClick={fillWithAi}
          disabled={busy || !aiEnabled || imageUrl === ''}
          className="rounded-lg bg-revenue px-4 py-2 text-sm font-bold text-canvas hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'Classifying…' : '✦ Fill with AI'}
        </button>
        <p className="min-w-0 flex-1 text-xs text-ink-3">
          {!aiEnabled
            ? 'AI is not set up yet (the backend needs ANTHROPIC_API_KEY). You can still type values by hand.'
            : imageUrl === ''
              ? 'Add this ad\'s creative link first: the AI reads the image.'
              : 'The AI reads the creative image and suggests every field with a confidence score. Check it before saving.'}
        </p>
        <label className="flex items-center gap-2 text-xs text-ink-2">
          Flag below
          <span className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              aria-label="Confidence threshold in percent"
              className={`${inputCls} w-16 pr-6 text-right`}
            />
            <span className="pointer-events-none absolute right-2 top-1.5 text-xs text-ink-3">%</span>
          </span>
        </label>
      </div>

      {error && <p className="mt-3 rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>}

      <div className="mt-5 grid gap-x-8 gap-y-6 lg:grid-cols-2">
        {renderSection('Intention / Message', 'intention_message', intention)}
        {renderSection('Physical / Execution', 'physical_execution', execution)}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {hasSaved && (
          <button
            type="button"
            onClick={onRemoveSaved}
            className="mr-auto text-sm text-ink-2 underline hover:text-ink"
            title="Delete the taxonomy saved for this ad and go back to the one in data.json (if any)"
          >
            Remove saved taxonomy
          </button>
        )}
        {invalid && <span className="text-sm text-loss">Confidence must be a number from 0 to 100</span>}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-ink-2 hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={invalid || !filled || busy}
          className="rounded-lg bg-revenue px-5 py-2 text-sm font-bold text-canvas hover:brightness-110 disabled:opacity-50"
        >
          Apply to table
        </button>
      </div>
      <p className="mt-2 text-right text-xs text-ink-3">Applying marks the ad as unsaved; press “Save changes” on the page to store it.</p>
    </Modal>
  );
}
