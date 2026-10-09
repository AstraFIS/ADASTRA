import { useCallback, useEffect, useMemo, useState } from 'react';
import { adAccessApi, type AdGroup, type UnnamedRowBucket } from '@/lib/adAccess';
import { formatCurrency, formatDate, formatInteger } from '@/lib/format';

const NO_AD_NAME = '(no ad name)';
const SOURCE_LABEL: Record<UnnamedRowBucket['source'], string> = { facebook: 'Facebook spend', partner: 'Partner events' };

type Load = { kind: 'loading' } | { kind: 'ok'; rows: UnnamedRowBucket[]; groups: AdGroup[] } | { kind: 'error'; message: string };

/**
 * Rows that have no ad name, so they cannot be put in Meta1 / Meta2 through the ad list.
 * The group chosen here is saved on the rows themselves (access_group) and the Facebook
 * dashboard's group filter and user access follow it.
 */
export default function UnnamedRowsPanel() {
  const [state, setState] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [bulkGroup, setBulkGroup] = useState<AdGroup | ''>('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [onlyUnset, setOnlyUnset] = useState(false);

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    adAccessApi
      .rows()
      .then((r) => setState({ kind: 'ok', rows: r.rows, groups: r.groups }))
      .catch((err: unknown) => setState({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load rows' }));
  }, []);
  useEffect(load, [load]);

  const rows = state.kind === 'ok' ? state.rows : [];
  const groups = state.kind === 'ok' ? state.groups : [];
  const unset = useMemo(() => rows.filter((r) => !r.group), [rows]);
  const shown = onlyUnset ? unset : rows;

  async function apply(buckets: UnnamedRowBucket[], group: AdGroup | null) {
    if (buckets.length === 0) return;
    const keys = new Set(buckets.map((b) => b.key));
    setBusy((s) => new Set([...s, ...keys]));
    setMessage(null);
    try {
      const res = await adAccessApi.saveRows(buckets.map((b) => ({ source: b.source, ids: b.ids, group })));
      setState((s) => (s.kind === 'ok' ? { ...s, rows: res.rows } : s));
      setMessage({
        tone: 'ok',
        text: `${group ? `Set to ${group}` : 'Group cleared'} on ${formatInteger(res.changed)} row${res.changed === 1 ? '' : 's'}.`,
      });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Saving failed' });
    } finally {
      setBusy((s) => new Set([...s].filter((k) => !keys.has(k))));
    }
  }

  const totals = useMemo(
    () => unset.reduce((t, r) => ({ revenue: t.revenue + r.revenue, spend: t.spend + r.spend }), { revenue: 0, spend: 0 }),
    [unset],
  );

  return (
    <section aria-labelledby="unnamed-rows-heading" className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 id="unnamed-rows-heading" className="text-base font-bold text-ink">
            Rows without an ad name
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
            These rows have no ad name, so they can't be grouped from the ad list below. Pick a group for each day here: it is
            saved on the rows themselves, and they then show under that group in the Facebook dashboard filter and for users
            with that group.
          </p>
        </div>
        {state.kind === 'ok' && unset.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-2">Set all {unset.length} unassigned to</span>
            <select
              value={bulkGroup}
              onChange={(e) => setBulkGroup(e.target.value as AdGroup | '')}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-ink"
              aria-label="Group for all unassigned rows"
            >
              <option value="">Choose…</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!bulkGroup || busy.size > 0}
              onClick={() => bulkGroup && apply(unset, bulkGroup)}
              className="rounded-lg bg-revenue px-3 py-1.5 font-bold text-canvas hover:brightness-110 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {message && (
        <p role="status" className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-revenue' : 'text-loss'}`}>
          {message.text}
        </p>
      )}

      {state.kind === 'loading' && <p className="mt-4 text-sm text-ink-3">Loading rows…</p>}
      {state.kind === 'error' && (
        <p className="mt-4 text-sm text-loss">
          {state.message}{' '}
          <button type="button" onClick={load} className="font-semibold underline">
            Try again
          </button>
        </p>
      )}
      {state.kind === 'ok' && rows.length === 0 && (
        <p className="mt-4 text-sm text-ink-3">Every row has an ad name — nothing to assign here.</p>
      )}

      {state.kind === 'ok' && rows.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-2">
            <span>
              <b className="text-spend">{unset.length}</b> unassigned
              {unset.length > 0 && (
                <>
                  {' '}
                  · {formatCurrency(totals.revenue)} revenue · {formatCurrency(totals.spend)} spend
                </>
              )}
            </span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyUnset} onChange={(e) => setOnlyUnset(e.target.checked)} />
              Only unassigned
            </label>
          </div>
          <div className="mt-2 max-h-[420px] overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
                  <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Source</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Ad / Sub ID</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Offer</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Spend</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Events</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Revenue</th>
                  <th scope="col" className="py-2 font-medium">Group</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const saving = busy.has(r.key);
                  return (
                    <tr key={r.key} className={`border-t border-line ${saving ? 'opacity-60' : ''}`}>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{r.date ? formatDate(r.date, 'medium') : '—'}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-ink-2">{SOURCE_LABEL[r.source]}</td>
                      <td className="py-2 pr-3">
                        <span className={r.adName === NO_AD_NAME ? 'italic text-ink-3' : 'font-semibold text-ink'}>{r.adName}</span>
                        {r.subIds.length > 0 && (
                          <span className="block max-w-[220px] truncate text-[11px] text-ink-3" title={r.subIds.join(', ')}>
                            {r.subIds.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-ink-2">{r.offer ?? '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.spend ? formatCurrency(r.spend) : '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.events ? formatInteger(r.events) : '—'}
                        {r.purchases > 0 && <span className="block text-[11px] text-revenue">{r.purchases} purchase{r.purchases === 1 ? '' : 's'}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{r.revenue ? formatCurrency(r.revenue) : '—'}</td>
                      <td className="py-2">
                        <select
                          value={r.group ?? ''}
                          disabled={saving}
                          onChange={(e) => apply([r], (e.target.value || null) as AdGroup | null)}
                          aria-label={`Group for ${SOURCE_LABEL[r.source]} on ${r.date ?? 'unknown day'}`}
                          className={`rounded-lg border px-2 py-1 text-sm ${
                            r.group ? 'border-line bg-surface-2 text-ink' : 'border-spend/50 bg-spend/10 text-spend'
                          }`}
                        >
                          <option value="">Not set</option>
                          {groups.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
