import { useCallback, useEffect, useMemo, useState } from 'react';
import { adAccessApi, type AdAssignment, type AdGroup } from '@/lib/adAccess';
import { getBaselineLinks } from '@/lib/creatives';
import {
  emptyTaxonomy,
  getBaselineTaxonomy,
  summarizeConfidence,
  type TaxonomyData,
  type TaxonomySource,
} from '@/lib/creativeTaxonomy';
import { formatPercent } from '@/lib/format';
import BulkTaxonomyPanel, { type ImportItem } from '@/components/BulkTaxonomyPanel';
import TaxonomyEditor from '@/components/TaxonomyEditor';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; ads: AdAssignment[] }
  | { kind: 'error'; message: string };

type Choice = AdGroup | null;
type Filter = 'all' | 'unassigned' | 'missing' | 'unclassified' | 'lowconf' | AdGroup;
type LinkField = 'image' | 'video' | 'landing';
type Links = Record<LinkField, string>;

const LINK_FIELDS: { key: LinkField; label: string; placeholder: string }[] = [
  { key: 'image', label: 'Ad / creative link', placeholder: 'Add ad image link…' },
  { key: 'video', label: 'Video link (optional)', placeholder: 'Add video link…' },
  { key: 'landing', label: 'Landing page link', placeholder: 'Add landing page link…' },
];

const isWebUrl = (v: string) => v === '' || /^https?:\/\/\S+$/i.test(v);

const GROUPS: AdGroup[] = ['Meta1', 'Meta2'];

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'missing', label: 'Missing links' },
  { value: 'unclassified', label: 'No taxonomy' },
  { value: 'lowconf', label: 'Low confidence' },
  { value: 'Meta1', label: 'Meta1' },
  { value: 'Meta2', label: 'Meta2' },
];

const SOURCE_LABEL: Record<TaxonomySource | 'file', string> = {
  ai: 'AI',
  manual: 'Manual',
  import: 'Imported',
  file: 'data.json',
};

/** Ads sent to the AI per request (each takes a few seconds). */
const AI_CHUNK = 2;

/** An unsaved taxonomy change. data null = remove the saved taxonomy (fall back to data.json). */
interface TaxDraft {
  data: TaxonomyData | null;
  source: TaxonomySource;
}

const GROUP_STYLE: Record<AdGroup, string> = {
  Meta1: 'border-azure bg-azure/15 text-azure',
  Meta2: 'border-violet bg-violet/15 text-violet',
};

export default function AdAccessPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  /** Unsaved choices: ad name -> chosen group. Only holds ads that differ from what is saved. */
  const [draft, setDraft] = useState<Map<string, Choice>>(new Map());
  /** Unsaved link edits: ad name -> the three links as typed. */
  const [linkDraft, setLinkDraft] = useState<Map<string, Links>>(new Map());
  /** Ads typed in by hand that are not in the database yet (they have no report data). */
  const [extraAds, setExtraAds] = useState<AdAssignment[]>([]);
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState<AdGroup>('Meta1');
  const [addError, setAddError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  /** Unsaved taxonomy edits: ad name -> new taxonomy. */
  const [taxDraft, setTaxDraft] = useState<Map<string, TaxDraft>>(new Map());
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiBusy, setAiBusy] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    adAccessApi
      .list()
      .then((r) => setState({ kind: 'ok', ads: r.ads }))
      .catch((err: unknown) =>
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' }),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    adAccessApi
      .aiStatus()
      .then((r) => setAiEnabled(r.enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  // warn before leaving the page with unsaved changes
  useEffect(() => {
    if (draft.size === 0 && linkDraft.size === 0 && taxDraft.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [draft.size, linkDraft.size, taxDraft.size]);

  const serverAds = state.kind === 'ok' ? state.ads : [];
  const ads = useMemo(() => {
    const known = new Set(serverAds.map((a) => a.adName));
    return [...serverAds, ...extraAds.filter((a) => !known.has(a.adName))].sort((a, b) =>
      a.adName.localeCompare(b.adName, undefined, { numeric: true }),
    );
  }, [serverAds, extraAds]);
  const adNames = useMemo(() => new Set(ads.map((a) => a.adName)), [ads]);
  const savedGroup = useMemo(() => new Map(ads.map((a) => [a.adName, a.group] as const)), [ads]);
  const currentGroup = useCallback(
    (name: string): Choice => (draft.has(name) ? (draft.get(name) as Choice) : (savedGroup.get(name) ?? null)),
    [draft, savedGroup],
  );

  /** Links as saved: creatives.json, with any override saved from this page on top. */
  const savedLinks = useCallback(
    (a: AdAssignment): Links => {
      const base = getBaselineLinks(a.adName);
      return {
        image: a.links.image ?? base.image,
        video: a.links.video ?? base.video,
        landing: a.links.landing ?? base.landing,
      };
    },
    [],
  );
  const currentLinks = useCallback(
    (a: AdAssignment): Links => linkDraft.get(a.adName) ?? savedLinks(a),
    [linkDraft, savedLinks],
  );
  const hasMissing = useCallback(
    (a: AdAssignment) => {
      const l = currentLinks(a);
      return l.image === '' || l.landing === ''; // video is optional
    },
    [currentLinks],
  );

  /** The taxonomy in effect: unsaved edit, else the one saved here, else data.json. `source` says which. */
  const currentTaxonomy = useCallback(
    (a: AdAssignment): { data: TaxonomyData; source: TaxonomySource | 'file' } | null => {
      const d = taxDraft.get(a.adName);
      if (d?.data) return { data: d.data, source: d.source };
      if (!d && a.taxonomy) return { data: a.taxonomy, source: a.taxonomy.source };
      const base = getBaselineTaxonomy(a.adName);
      return base ? { data: base, source: 'file' } : null;
    },
    [taxDraft],
  );
  const isLowConfidence = useCallback(
    (a: AdAssignment) => {
      const t = currentTaxonomy(a);
      return t !== null && summarizeConfidence(t.data).low > 0;
    },
    [currentTaxonomy],
  );
  /** Whether a taxonomy saved from this page is in effect (so "remove" has something to remove). */
  const hasSavedTaxonomy = (a: AdAssignment) => (taxDraft.has(a.adName) ? taxDraft.get(a.adName)!.data !== null : a.taxonomy !== null);

  function setTaxonomy(a: AdAssignment, data: TaxonomyData | null, source: TaxonomySource) {
    setNotice(null);
    setTaxDraft((prev) => {
      const next = new Map(prev);
      // removing something that was never saved just drops the pending edit
      if (data === null && a.taxonomy === null) next.delete(a.adName);
      else next.set(a.adName, { data, source });
      return next;
    });
  }

  /** Sends ads to the AI in small batches and puts the suggestions in the table as unsaved edits. */
  async function classifyAds(targets: AdAssignment[]) {
    const ready = targets.filter((a) => currentLinks(a).image.trim() !== '' && isWebUrl(currentLinks(a).image.trim()));
    const skipped = targets.length - ready.length;
    if (ready.length === 0) {
      setNotice({ tone: 'error', text: 'None of those ads has a creative image link, so the AI has nothing to read. Add the link first.' });
      return;
    }
    setNotice(null);
    setAiBusy((prev) => new Set([...prev, ...ready.map((a) => a.adName)]));
    let done = 0;
    const failures: string[] = [];
    for (let i = 0; i < ready.length; i += AI_CHUNK) {
      const chunk = ready.slice(i, i + AI_CHUNK);
      try {
        const { results } = await adAccessApi.classify(
          chunk.map((a) => ({ adName: a.adName, imageUrl: currentLinks(a).image.trim(), landingUrl: currentLinks(a).landing.trim() || null })),
        );
        for (const r of results) {
          const ad = chunk.find((a) => a.adName === r.adName);
          if (ad && r.taxonomy) {
            setTaxonomy(ad, r.taxonomy, 'ai');
            done += 1;
          } else failures.push(`${r.adName}: ${r.error ?? 'no result'}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'request failed';
        chunk.forEach((a) => failures.push(`${a.adName}: ${msg}`));
        if (!(err instanceof Error) || /not set up|403|401/.test(err.message)) break;
      } finally {
        setAiBusy((prev) => {
          const next = new Set(prev);
          chunk.forEach((a) => next.delete(a.adName));
          return next;
        });
      }
    }
    // anything left in the busy set after an early stop
    setAiBusy(new Set());
    const parts = [`AI classified ${done} ad${done === 1 ? '' : 's'}${done > 0 ? ' — review the scores, then press “Save changes”' : ''}.`];
    if (skipped > 0) parts.push(`${skipped} skipped (no creative link).`);
    if (failures.length > 0) parts.push(`${failures.length} failed: ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '…' : ''}`);
    setNotice({ tone: failures.length > 0 && done === 0 ? 'error' : 'ok', text: parts.join(' ') });
  }

  function importTaxonomies(items: ImportItem[]) {
    setNotice(null);
    setTaxDraft((prev) => {
      const next = new Map(prev);
      for (const { adName, taxonomy } of items) next.set(adName, { data: taxonomy, source: 'import' });
      return next;
    });
  }

  /** Everything, in the data.json format, ready to edit and upload again. Unclassified ads get blank fields. */
  const buildExport = () =>
    ads.map((a) => ({ ad_name: a.adName, creative_taxonomy: currentTaxonomy(a)?.data ?? emptyTaxonomy() }));

  function setLink(a: AdAssignment, field: LinkField, value: string) {
    setNotice(null);
    setLinkDraft((prev) => {
      const next = new Map(prev);
      const updated = { ...(prev.get(a.adName) ?? savedLinks(a)), [field]: value };
      const saved = savedLinks(a);
      const same = LINK_FIELDS.every(({ key }) => updated[key].trim() === saved[key]);
      if (same) next.delete(a.adName);
      else next.set(a.adName, updated);
      return next;
    });
  }

  const counts = useMemo(() => {
    const c = { Meta1: 0, Meta2: 0, unassigned: 0, missing: 0, unclassified: 0, lowconf: 0 };
    for (const a of ads) {
      if (hasMissing(a)) c.missing += 1;
      if (currentTaxonomy(a) === null) c.unclassified += 1;
      else if (isLowConfidence(a)) c.lowconf += 1;
      const g = currentGroup(a.adName);
      if (g) c[g] += 1;
      else c.unassigned += 1;
    }
    return c;
  }, [ads, currentGroup, hasMissing, currentTaxonomy, isLowConfidence]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ads.filter((a) => {
      if (q && !a.adName.toLowerCase().includes(q)) return false;
      const g = currentGroup(a.adName);
      if (filter === 'all') return true;
      if (filter === 'unassigned') return g === null;
      if (filter === 'missing') return hasMissing(a);
      if (filter === 'unclassified') return currentTaxonomy(a) === null;
      if (filter === 'lowconf') return isLowConfidence(a);
      return g === filter;
    });
  }, [ads, search, filter, currentGroup, hasMissing, currentTaxonomy, isLowConfidence]);

  function choose(names: string[], group: Choice) {
    setNotice(null);
    setDraft((prev) => {
      const next = new Map(prev);
      for (const name of names) {
        if ((savedGroup.get(name) ?? null) === group) next.delete(name);
        else next.set(name, group);
      }
      return next;
    });
  }

  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.has(a.adName));

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((a) => next.delete(a.adName));
      else visible.forEach((a) => next.add(a.adName));
      return next;
    });
  }

  function toggleOne(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const unsavedNames = useMemo(
    () => new Set([...draft.keys(), ...linkDraft.keys(), ...taxDraft.keys(), ...extraAds.map((a) => a.adName)]),
    [draft, linkDraft, taxDraft, extraAds],
  );

  function addAd() {
    const name = newName.trim();
    if (!name) return setAddError('Type the ad name first.');
    if (name.length > 200) return setAddError('Ad name is too long (200 characters max).');
    if (adNames.has(name)) {
      setSearch(name);
      setFilter('all');
      return setAddError(`"${name}" is already in the list — showing it below.`);
    }
    setAddError(null);
    setNotice(null);
    setExtraAds((prev) => [...prev, { adName: name, group: null, hasReports: false, links: { image: null, video: null, landing: null }, taxonomy: null }]);
    setDraft((prev) => new Map(prev).set(name, newGroup));
    setNewName('');
    setSearch(name);
    setFilter('all');
  }
  const invalidLinks = useMemo(
    () => [...linkDraft.values()].some((l) => LINK_FIELDS.some(({ key }) => !isWebUrl(l[key].trim()))),
    [linkDraft],
  );

  function applyToSelected(group: Choice) {
    choose([...selected], group);
    setSelected(new Set());
  }

  async function save() {
    if (unsavedNames.size === 0) return;
    if (invalidLinks) {
      setNotice({ tone: 'error', text: 'Some links are not valid. A link must start with http:// or https://' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const links = [...linkDraft].map(([adName, l]) => {
        const base = getBaselineLinks(adName);
        // same as creatives.json -> no override (null); anything else is saved, "" meaning cleared
        const field = (k: LinkField) => (l[k].trim() === base[k] ? null : l[k].trim());
        return { adName, image: field('image'), video: field('video'), landing: field('landing') };
      });
      const assignments = [...draft].map(([adName, group]) => ({ adName, group }));
      const taxonomies = [...taxDraft].map(([adName, t]) => ({ adName, taxonomy: t.data, source: t.source }));
      if (assignments.length === 0 && links.length === 0 && taxonomies.length === 0) {
        // only hand-added ads that were set back to "None" with no links: nothing to store
        setExtraAds([]);
        setNotice({ tone: 'ok', text: 'Nothing to save.' });
        return;
      }
      const result = await adAccessApi.save({ assignments, links, taxonomies });
      setState({ kind: 'ok', ads: result.ads });
      setExtraAds([]);
      setDraft(new Map());
      setLinkDraft(new Map());
      setTaxDraft(new Map());
      setSelected(new Set());
      setNotice({ tone: 'ok', text: `Saved ${unsavedNames.size} ad${unsavedNames.size === 1 ? '' : 's'}. Changes apply immediately.` });
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">Administration</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Ad groups</h1>
        <p className="mt-2 max-w-3xl text-base text-ink-2">
          Choose which group (Meta1 or Meta2) each Facebook ad belongs to. Changes are saved permanently to the database
          and decide which ads each user can see. Ads left unassigned are visible to admins only. You can also add or
          fix each ad's creative and landing page links here, and add its creative taxonomy with confidence scores (type
          it, fill it with AI, or bulk import it); the links and taxonomy show on the ad's page.
        </p>
      </header>

      {notice && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.tone === 'ok'
              ? 'border-revenue/40 bg-revenue/10 text-revenue'
              : 'border-loss/40 bg-loss/10 text-loss'
          }`}
        >
          {notice.text}
        </p>
      )}

      {state.kind === 'loading' && <p className="text-ink-2">Loading ads…</p>}

      {state.kind === 'error' && (
        <div className="rounded-lg border border-loss/40 bg-loss/10 p-4 text-sm text-loss">
          <p>{state.message}</p>
          <button type="button" onClick={load} className="mt-2 font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {state.kind === 'ok' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:max-w-4xl sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Meta1" value={counts.Meta1} className="text-azure" />
            <Stat label="Meta2" value={counts.Meta2} className="text-violet" />
            <Stat label="Unassigned" value={counts.unassigned} className="text-spend" />
            <Stat label="Missing links" value={counts.missing} className="text-loss" />
            <Stat label="No taxonomy" value={counts.unclassified} className="text-spend" />
            <Stat label="Low confidence" value={counts.lowconf} className="text-spend" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ad name…"
              aria-label="Search ad name"
              className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-base text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue sm:w-72"
            />
            <div className="flex gap-1 rounded-lg border border-line bg-surface p-1" role="group" aria-label="Filter">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    filter === f.value ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="text-sm text-ink-3">
              Showing {visible.length} of {ads.length}
            </span>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink">Can't find an ad? Add it by name</p>
            <p className="mt-1 text-xs text-ink-3">
              For ads with no report data yet. Type the exact ad name as it will appear in the reports, pick a group, then
              save.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setAddError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && addAd()}
                placeholder="Exact ad name…"
                aria-label="New ad name"
                className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue sm:w-72"
              />
              <select
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value as AdGroup)}
                aria-label="Group for the new ad"
                className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-ink focus:border-revenue focus:outline-none"
              >
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addAd}
                className="rounded-lg border border-revenue px-4 py-2 text-sm font-bold text-revenue hover:bg-revenue/10"
              >
                + Add ad
              </button>
            </div>
            {addError && <p className="mt-2 text-sm text-loss">{addError}</p>}
          </div>

          <BulkTaxonomyPanel adNames={ads.map((a) => a.adName)} buildExport={buildExport} onImport={importTaxonomies} />

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-surface-2 px-4 py-3">
              <span className="text-sm font-medium text-ink">{selected.size} selected — move to:</span>
              {GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => applyToSelected(g)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${GROUP_STYLE[g]}`}
                >
                  {g}
                </button>
              ))}
              <button
                type="button"
                onClick={() => applyToSelected(null)}
                className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-semibold text-ink-2 hover:text-ink"
              >
                Unassigned
              </button>
              <button
                type="button"
                disabled={!aiEnabled || aiBusy.size > 0}
                title={aiEnabled ? 'Reads each selected ad\'s creative image' : 'AI is not set up (backend needs ANTHROPIC_API_KEY)'}
                onClick={() => {
                  void classifyAds(ads.filter((a) => selected.has(a.adName)));
                  setSelected(new Set());
                }}
                className="rounded-md border border-revenue px-3 py-1.5 text-sm font-semibold text-revenue hover:bg-revenue/10 disabled:opacity-50"
              >
                ✦ Classify with AI
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-sm text-ink-2 underline">
                Clear selection
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label="Select all shown ads"
                    />
                  </th>
                  <th className="px-4 py-3">Ad name</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Creative taxonomy</th>
                  {LINK_FIELDS.map((f) => (
                    <th key={f.key} className="px-4 py-3">
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4 + LINK_FIELDS.length} className="px-4 py-8 text-center text-ink-3">
                      No ads match.
                    </td>
                  </tr>
                )}
                {visible.map((a) => {
                  const group = currentGroup(a.adName);
                  const changed = unsavedNames.has(a.adName);
                  const links = currentLinks(a);
                  return (
                    <tr key={a.adName} className={`border-b border-line last:border-0 ${changed ? 'bg-spend/5' : ''}`}>
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(a.adName)}
                          onChange={() => toggleOne(a.adName)}
                          aria-label={`Select ${a.adName}`}
                        />
                      </td>
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {a.adName}
                        {!a.hasReports && (
                          <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-normal text-ink-3">
                            {extraAds.some((x) => x.adName === a.adName) ? 'new — not saved yet' : 'no report data'}
                          </span>
                        )}
                        {changed && <span className="ml-2 text-xs font-normal text-spend">unsaved</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="inline-flex gap-1" role="group" aria-label={`Group for ${a.adName}`}>
                          {GROUPS.map((g) => (
                            <button
                              key={g}
                              type="button"
                              aria-pressed={group === g}
                              onClick={() => choose([a.adName], g)}
                              className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                                group === g ? GROUP_STYLE[g] : 'border-line text-ink-3 hover:text-ink'
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                          <button
                            type="button"
                            aria-pressed={group === null}
                            onClick={() => choose([a.adName], null)}
                            className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                              group === null ? 'border-spend bg-spend/15 text-spend' : 'border-line text-ink-3 hover:text-ink'
                            }`}
                          >
                            None
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <TaxonomyCell
                          tax={currentTaxonomy(a)}
                          busy={aiBusy.has(a.adName)}
                          canAi={aiEnabled && links.image.trim() !== ''}
                          onEdit={() => setEditing(a.adName)}
                          onAi={() => void classifyAds([a])}
                        />
                      </td>
                      {LINK_FIELDS.map((f) => {
                        const value = links[f.key];
                        const bad = !isWebUrl(value.trim());
                        return (
                          <td key={f.key} className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={value}
                                onChange={(e) => setLink(a, f.key, e.target.value)}
                                placeholder={f.placeholder}
                                aria-label={`${f.label} for ${a.adName}`}
                                aria-invalid={bad}
                                className={`w-56 rounded-md border bg-surface-2 px-3 py-1.5 text-xs text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 ${
                                  bad
                                    ? 'border-loss focus:ring-loss'
                                    : value === '' && f.key !== 'video'
                                      ? 'border-spend/60 focus:border-revenue focus:ring-revenue'
                                      : 'border-line focus:border-revenue focus:ring-revenue'
                                }`}
                              />
                              {value !== '' && !bad && (
                                <a
                                  href={value.trim()}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="shrink-0 text-xs font-semibold text-revenue underline"
                                >
                                  Open
                                </a>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing !== null && (() => {
        const a = ads.find((x) => x.adName === editing);
        if (!a) return null;
        return (
          <TaxonomyEditor
            adName={a.adName}
            initial={currentTaxonomy(a)?.data ?? null}
            hasSaved={hasSavedTaxonomy(a)}
            aiEnabled={aiEnabled}
            imageUrl={currentLinks(a).image.trim()}
            onClassify={async () => {
              const l = currentLinks(a);
              const { results } = await adAccessApi.classify([
                { adName: a.adName, imageUrl: l.image.trim(), landingUrl: l.landing.trim() || null },
              ]);
              const r = results[0];
              if (!r?.taxonomy) throw new Error(r?.error ?? 'The AI returned nothing');
              return r.taxonomy;
            }}
            onApply={(data, source) => {
              setTaxonomy(a, data, source);
              setEditing(null);
            }}
            onRemoveSaved={() => {
              setTaxonomy(a, null, 'manual');
              setEditing(null);
            }}
            onClose={() => setEditing(null)}
          />
        );
      })()}

      {unsavedNames.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-surface/95 px-4 py-3 backdrop-blur md:px-10">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="mr-auto text-sm text-ink">
              {unsavedNames.size} ad{unsavedNames.size === 1 ? '' : 's'} with unsaved changes
              {invalidLinks && <span className="ml-3 text-loss">Fix the invalid links first</span>}
            </span>
            <button
              type="button"
              onClick={() => {
                setDraft(new Map());
                setLinkDraft(new Map());
                setTaxDraft(new Map());
                setExtraAds([]);
              }}
              disabled={saving}
              className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-ink-2 hover:text-ink disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || invalidLinks}
              className="rounded-lg bg-revenue px-5 py-2 text-sm font-bold text-canvas hover:brightness-110 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${className}`}>{value}</p>
    </div>
  );
}

function TaxonomyCell({
  tax,
  busy,
  canAi,
  onEdit,
  onAi,
}: {
  tax: { data: TaxonomyData; source: TaxonomySource | 'file' } | null;
  busy: boolean;
  canAi: boolean;
  onEdit: () => void;
  onAi: () => void;
}) {
  const summary = tax ? summarizeConfidence(tax.data) : null;
  const angle = tax?.data.intention_message.angle?.value;
  const hookType = tax?.data.intention_message.hook_type?.value;
  return (
    <div className="flex min-w-60 items-center gap-3">
      <div className="min-w-0 flex-1">
        {busy ? (
          <p className="text-xs text-ink-2">Classifying…</p>
        ) : tax && summary ? (
          <>
            <p className="max-w-56 truncate text-xs font-medium text-ink" title={[angle, hookType].filter(Boolean).join(' · ')}>
              {angle || hookType || 'Classified'}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
              {summary.average !== null && (
                <span className="text-ink-2">Avg {formatPercent(summary.average, 0)}</span>
              )}
              {summary.low > 0 ? (
                <span className="font-semibold text-spend">
                  {summary.low} low (&lt;{formatPercent(summary.threshold, 0)})
                </span>
              ) : (
                summary.scored > 0 && <span className="text-revenue">all OK</span>
              )}
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-ink-3">{SOURCE_LABEL[tax.source]}</span>
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-3">Not classified</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink-2 hover:text-ink"
        >
          {tax ? 'Edit' : 'Add'}
        </button>
        <button
          type="button"
          onClick={onAi}
          disabled={busy || !canAi}
          title={canAi ? 'Classify this ad with AI' : 'Needs a creative image link and the AI set up on the backend'}
          className="rounded-md border border-revenue/60 px-2 py-1 text-xs font-semibold text-revenue hover:bg-revenue/10 disabled:opacity-40"
        >
          ✦ AI
        </button>
      </div>
    </div>
  );
}
