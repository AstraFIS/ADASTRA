import { useRef, useState } from 'react';
import { parseTaxonomyRecord, type TaxonomyData } from '@/lib/creativeTaxonomy';

export interface ImportItem {
  adName: string;
  taxonomy: TaxonomyData;
}

interface Summary {
  applied: number;
  unmatched: string[];
  invalid: { name: string; reason: string }[];
  empty: number;
}

interface Props {
  /** Exact ad names currently in the list. */
  adNames: string[];
  /** Every ad with its effective taxonomy (blank for unclassified ads), for the download. */
  buildExport: () => { ad_name: string; creative_taxonomy: TaxonomyData }[];
  /** Puts the items into the table as unsaved changes. */
  onImport: (items: ImportItem[]) => void;
}

const SAMPLE = `[
  {
    "ad_name": "DM_savings1",
    "creative_taxonomy": {
      "confidence_threshold": 0.7,
      "intention_message": {
        "angle": { "value": "Savings / Best Value", "confidence": 0.9 },
        "hook_type": { "value": "Price_Savings", "confidence": 0.85 }
      },
      "physical_execution": {
        "format": { "value": "Static", "confidence": 0.99 }
      }
    }
  }
]`;

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const isBlank = (t: TaxonomyData) =>
  [...Object.values(t.intention_message), ...Object.values(t.physical_execution)].every(
    (f) => (f.value === null || f.value === '') && f.confidence === undefined,
  );

export default function BulkTaxonomyPanel({ adNames, buildExport, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function run(source: string) {
    setError(null);
    setSummary(null);
    let data: unknown;
    try {
      data = JSON.parse(source);
    } catch {
      return setError('That is not valid JSON. Paste the whole list, starting with [ and ending with ].');
    }
    const list = Array.isArray(data) ? data : (data as { ads?: unknown; records?: unknown } | null)?.ads ?? (data as { records?: unknown } | null)?.records;
    if (!Array.isArray(list)) return setError('Expected a list of records like [{ "ad_name": …, "creative_taxonomy": … }].');
    if (list.length > 2000) return setError('Too many records in one go (2000 max).');

    const exact = new Set(adNames);
    const byLower = new Map<string, string[]>();
    for (const n of adNames) byLower.set(n.toLowerCase(), [...(byLower.get(n.toLowerCase()) ?? []), n]);

    const items = new Map<string, ImportItem>();
    const result: Summary = { applied: 0, unmatched: [], invalid: [], empty: 0 };
    list.forEach((raw, i) => {
      const parsed = parseTaxonomyRecord(raw);
      if (!parsed.ok) {
        const label = typeof raw === 'object' && raw && 'ad_name' in raw ? String((raw as { ad_name: unknown }).ad_name) : `record ${i + 1}`;
        return void result.invalid.push({ name: label, reason: parsed.error });
      }
      if (isBlank(parsed.taxonomy)) return void (result.empty += 1);
      // exact name first; otherwise a case-insensitive match when it is unambiguous
      const match = exact.has(parsed.adName) ? parsed.adName : byLower.get(parsed.adName.toLowerCase())?.length === 1 ? byLower.get(parsed.adName.toLowerCase())![0] : null;
      if (!match) return void result.unmatched.push(parsed.adName);
      items.set(match, { adName: match, taxonomy: parsed.taxonomy }); // last record wins
    });
    result.applied = items.size;
    if (items.size > 0) onImport([...items.values()]);
    setSummary(result);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('That file is too large (5 MB max).');
    const content = await file.text();
    setText(content);
    run(content);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="text-sm font-semibold text-ink">Bulk import / export taxonomy</span>
          <span className="mt-1 block text-xs text-ink-3">
            Update many ads at once: download the list, fill it in (or paste AI output), and upload it back.
          </span>
        </span>
        <span className="text-ink-3" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => download('creative-taxonomy.json', JSON.stringify(buildExport(), null, 2))}
              className="rounded-lg border border-line-strong px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              ⬇ Download all ads (JSON)
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-revenue px-3 py-2 text-sm font-bold text-revenue hover:bg-revenue/10"
            >
              ⬆ Upload JSON file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <button type="button" onClick={() => setText(SAMPLE)} className="text-sm text-ink-2 underline hover:text-ink">
              Show example
            </button>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder="…or paste the JSON here (same format as data.json)"
            aria-label="Taxonomy JSON"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => run(text)}
              disabled={text.trim() === ''}
              className="rounded-lg bg-revenue px-4 py-2 text-sm font-bold text-canvas hover:brightness-110 disabled:opacity-50"
            >
              Apply to table
            </button>
            <span className="text-xs text-ink-3">Nothing is stored until you press “Save changes”. Ads are matched by name.</span>
          </div>

          {error && <p className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>}

          {summary && (
            <div className="space-y-1 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm" role="status">
              <p className={summary.applied > 0 ? 'font-semibold text-revenue' : 'font-semibold text-spend'}>
                {summary.applied} ad{summary.applied === 1 ? '' : 's'} updated in the table
                {summary.applied > 0 && ' — review them, then press “Save changes”.'}
              </p>
              {summary.empty > 0 && <p className="text-ink-2">{summary.empty} blank record(s) skipped.</p>}
              {summary.unmatched.length > 0 && (
                <p className="text-ink-2">
                  {summary.unmatched.length} not in the ad list (skipped; add the ad first with “Add it by name”):{' '}
                  <span className="text-ink-3">{summary.unmatched.slice(0, 15).join(', ')}{summary.unmatched.length > 15 ? '…' : ''}</span>
                </p>
              )}
              {summary.invalid.length > 0 && (
                <p className="text-loss">
                  {summary.invalid.length} invalid:{' '}
                  {summary.invalid.slice(0, 8).map((x) => `${x.name} (${x.reason})`).join('; ')}
                  {summary.invalid.length > 8 ? '…' : ''}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
