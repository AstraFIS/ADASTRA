import { useEffect, useMemo, useState } from 'react';
import { adAccessApi, type PartnerOfferRow } from '@/lib/adAccess';

type Draft = { partner_name: string; partner_login: string };
const keyOf = (o: Pick<PartnerOfferRow, 'platform' | 'offer_name'>) => `${o.platform}|${o.offer_name}`;
const PLATFORM = { facebook: 'Facebook', bing: 'Bing' } as const;

/**
 * Which partner and which partner login each offer runs under. The Finance page groups
 * offers by partner → login with these. Only the login's username is stored — no passwords.
 */
export default function PartnerOffersPanel() {
  const [rows, setRows] = useState<PartnerOfferRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Map<string, Draft>>(new Map());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    adAccessApi
      .partners()
      .then((r) => setRows(r.offers))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load offers'));
  }, []);

  const current = (o: PartnerOfferRow): Draft =>
    draft.get(keyOf(o)) ?? { partner_name: o.partner_name ?? '', partner_login: o.partner_login ?? '' };

  const partnersList = useMemo(() => {
    const s = new Set<string>();
    rows?.forEach((o) => o.partner_name && s.add(o.partner_name));
    draft.forEach((d) => d.partner_name.trim() && s.add(d.partner_name.trim()));
    return [...s].sort();
  }, [rows, draft]);
  const loginsList = useMemo(() => {
    const s = new Set<string>();
    rows?.forEach((o) => o.partner_login && s.add(o.partner_login));
    draft.forEach((d) => d.partner_login.trim() && s.add(d.partner_login.trim()));
    return [...s].sort();
  }, [rows, draft]);

  function change(o: PartnerOfferRow, field: keyof Draft, value: string) {
    setNotice(null);
    setDraft((prev) => {
      const next = new Map(prev);
      const d = { ...current(o), [field]: value };
      const same = d.partner_name.trim() === (o.partner_name ?? '') && d.partner_login.trim() === (o.partner_login ?? '');
      if (same) next.delete(keyOf(o));
      else next.set(keyOf(o), d);
      return next;
    });
  }

  async function save() {
    if (!rows || draft.size === 0) return;
    setSaving(true);
    try {
      const items = rows
        .filter((o) => draft.has(keyOf(o)))
        .map((o) => {
          const d = draft.get(keyOf(o))!;
          return {
            platform: o.platform,
            offer_name: o.offer_name,
            partner_name: d.partner_name.trim() || null,
            partner_login: d.partner_login.trim() || null,
          };
        });
      const res = await adAccessApi.savePartners(items);
      setRows(res.offers);
      setDraft(new Map());
      setNotice(`Saved ${items.length} offer${items.length === 1 ? '' : 's'}.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Saving failed');
    } finally {
      setSaving(false);
    }
  }

  const unassigned = rows?.filter((o) => !current(o).partner_name.trim()).length ?? 0;

  return (
    <section aria-labelledby="partners-heading" className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-left">
          <h2 id="partners-heading" className="text-base font-bold text-ink">
            {open ? '▾' : '▸'} Partners &amp; logins
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs text-ink-3">
            Which partner and which partner login each offer runs under — the Finance page groups revenue by these. Enter
            the login <b>username only</b>, never a password.
          </p>
        </button>
        <div className="flex items-center gap-3">
          {rows && (
            <span className={`text-xs ${unassigned ? 'text-spend' : 'text-ink-3'}`}>
              {unassigned} of {rows.length} offers without a partner
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || draft.size === 0}
            className="rounded-lg bg-revenue px-4 py-1.5 text-sm font-bold text-canvas hover:brightness-110 disabled:opacity-50"
          >
            {saving ? 'Saving…' : draft.size ? `Save ${draft.size} change${draft.size === 1 ? '' : 's'}` : 'Saved'}
          </button>
        </div>
      </div>
      {notice && <p className="mt-2 text-sm text-revenue">{notice}</p>}
      {error && <p className="mt-3 text-sm text-loss">{error}</p>}
      {open && rows && (
        <div className="mt-3 overflow-x-auto">
          <datalist id="partner-names">
            {partnersList.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <datalist id="partner-logins">
            {loginsList.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
                <th className="py-2 pr-3 font-medium">Platform</th>
                <th className="py-2 pr-3 font-medium">Offer</th>
                <th className="py-2 pr-3 font-medium">Partner</th>
                <th className="py-2 font-medium">Partner login (username)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const d = current(o);
                const changed = draft.has(keyOf(o));
                return (
                  <tr key={keyOf(o)} className={`border-t border-line ${changed ? 'bg-spend/5' : ''}`}>
                    <td className={`py-1.5 pr-3 text-xs font-semibold ${o.platform === 'facebook' ? 'text-azure' : 'text-violet'}`}>
                      {PLATFORM[o.platform]}
                    </td>
                    <td className="max-w-[420px] truncate py-1.5 pr-3 text-ink" title={o.offer_name}>
                      {o.offer_name}
                      {!o.in_data && <span className="ml-2 text-[11px] text-ink-3">(no data)</span>}
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        list="partner-names"
                        value={d.partner_name}
                        onChange={(e) => change(o, 'partner_name', e.target.value)}
                        placeholder="Partner…"
                        aria-label={`Partner for ${o.offer_name}`}
                        className={`w-48 rounded-md border bg-surface-2 px-2 py-1 text-sm text-ink placeholder:text-ink-3 ${d.partner_name.trim() ? 'border-line' : 'border-spend/50'}`}
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        list="partner-logins"
                        value={d.partner_login}
                        onChange={(e) => change(o, 'partner_login', e.target.value)}
                        placeholder="Login username…"
                        autoComplete="off"
                        aria-label={`Partner login for ${o.offer_name}`}
                        className="w-48 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-ink placeholder:text-ink-3"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
