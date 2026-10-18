import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrency, formatInteger } from '@/lib/format';
import { BING_MEDIA_BUYERS, type BingBuyerFilter, type BingMediaBuyer } from '@/types/auth';

/** Mirrors backend/src/services/bingCampaignBuyers.service.ts */
type Source = 'suffix' | 'manual' | 'keyword_report' | 'none';
interface CampaignBuyerRow {
  campaign_name: string;
  media_buyer: BingBuyerFilter;
  source: Source;
  keyword_report_buyer: BingMediaBuyer | null;
  in_ad_reports: boolean;
  in_keyword_reports: boolean;
  in_partner_events: boolean;
  spend_usd: number;
  ad_spend_usd: number;
  keyword_spend_usd: number;
  partner_events: number;
}

const ENDPOINT = '/platforms/microsoft/campaign-buyers';

const SOURCE_LABEL: Record<Source, string> = {
  suffix: 'from campaign name',
  manual: 'set here',
  keyword_report: 'from keyword report',
  none: 'not assigned',
};

/** The pick for a campaign: a buyer, or null for "no manual pick". */
type Pick = BingMediaBuyer | null;

interface Props {
  /** Called after a save so the dashboard reloads with the new split. */
  onSaved: () => void;
}

/**
 * Admin section on the Bing page: assign TH / TH2 to campaigns whose name has no _th / _th2 suffix.
 * Suffixed campaigns are listed read-only. Saved to bing_campaign_buyers.
 */
export default function BingCampaignBuyers({ onSaved }: Props) {
  const [rows, setRows] = useState<CampaignBuyerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, Pick>>({});
  const [saving, setSaving] = useState(false);
  const [showAssigned, setShowAssigned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ campaigns: CampaignBuyerRow[] }>(ENDPOINT)
      .then((r) => !cancelled && setRows(r.campaigns ?? []))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load campaigns'));
    return () => {
      cancelled = true;
    };
  }, []);

  const unassigned = rows?.filter((r) => r.source === 'none').length ?? 0;
  const editable = rows?.filter((r) => r.source !== 'suffix') ?? [];
  const suffixed = rows?.filter((r) => r.source === 'suffix') ?? [];

  /** The pick currently shown for a row: the draft, else the saved manual pick, else none. */
  const pickOf = (r: CampaignBuyerRow): Pick =>
    r.campaign_name in draft ? draft[r.campaign_name]! : r.source === 'manual' ? (r.media_buyer as BingMediaBuyer) : null;

  const changes = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => r.campaign_name in draft)
        .filter((r) => draft[r.campaign_name] !== (r.source === 'manual' ? r.media_buyer : null))
        .map((r) => ({ campaign_name: r.campaign_name, media_buyer: draft[r.campaign_name]! })),
    [rows, draft],
  );

  const visible = showAssigned ? editable : editable.filter((r) => r.source === 'none' || r.campaign_name in draft || r.source === 'manual');

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await api.put<{ campaigns: CampaignBuyerRow[] }>(ENDPOINT, { assignments: changes });
      setRows(r.campaigns);
      setDraft({});
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="campaign-buyers-heading" className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="min-w-0">
          <span id="campaign-buyers-heading" className="text-base font-bold text-ink">
            Campaign buyers
          </span>
          <span className="ml-2 text-xs font-medium uppercase tracking-wide text-ink-3">admin</span>
          <span className="mt-0.5 block text-xs text-ink-3">
            Assign TH / TH2 to campaigns whose name has no <code>_th</code> / <code>_th2</code> suffix
          </span>
        </span>
        <span className="flex items-center gap-3">
          {rows && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                unassigned ? 'bg-spend/15 text-spend' : 'bg-revenue/15 text-revenue'
              }`}
            >
              {unassigned ? `${unassigned} unassigned` : 'all assigned'}
            </span>
          )}
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-5 pb-5 pt-4">
          {error && <p className="mb-3 rounded-lg border border-loss/40 px-3 py-2 text-sm text-loss">{error}</p>}
          {!rows ? (
            !error && <p className="text-sm text-ink-3">Loading campaigns…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={showAssigned}
                    onChange={(e) => setShowAssigned(e.target.checked)}
                    className="h-4 w-4 rounded border-line accent-revenue"
                  />
                  Also show campaigns the keyword report already assigns
                </label>
                <div className="flex items-center gap-2">
                  {changes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDraft({})}
                      disabled={saving}
                      className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2"
                    >
                      Discard
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || changes.length === 0}
                    className="rounded-lg bg-revenue px-4 py-2 text-sm font-bold text-canvas disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : changes.length ? `Save ${changes.length} change${changes.length === 1 ? '' : 's'}` : 'Saved'}
                  </button>
                </div>
              </div>

              {visible.length === 0 ? (
                <p className="mt-4 text-sm text-ink-3">
                  Every campaign without a suffix is already assigned by the keyword report. Tick the box above to change one.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-ink-2">
                        <th scope="col" className="px-3 py-2.5 font-semibold">Campaign</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Found in</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold" title="Larger of ad report / keyword report spend">Spend</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Now</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Media buyer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => {
                        const pick = pickOf(r);
                        const changed = r.campaign_name in draft && draft[r.campaign_name] !== (r.source === 'manual' ? r.media_buyer : null);
                        return (
                          <tr key={r.campaign_name} className={`border-t border-line ${changed ? 'bg-azure/5' : ''}`}>
                            <td className="max-w-[360px] px-3 py-2.5 font-medium text-ink">
                              <span className="block truncate" title={r.campaign_name}>{r.campaign_name}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="flex flex-wrap gap-1">
                                {r.in_ad_reports && <Chip>Ad report</Chip>}
                                {r.in_keyword_reports && <Chip>Keywords</Chip>}
                                {r.in_partner_events && <Chip>{`Partner · ${formatInteger(r.partner_events)}`}</Chip>}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-ink">{r.spend_usd ? formatCurrency(r.spend_usd) : <span className="text-ink-3">$0</span>}</td>
                            <td className="px-3 py-2.5 text-xs">
                              <span className={r.source === 'none' ? 'font-semibold text-spend' : 'text-ink-2'}>
                                {r.source === 'none' ? 'Unassigned' : `${r.media_buyer} · ${SOURCE_LABEL[r.source]}`}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <div role="radiogroup" aria-label={`Media buyer for ${r.campaign_name}`} className="inline-flex rounded-lg bg-surface-2 p-1">
                                {[null, ...BING_MEDIA_BUYERS].map((b) => {
                                  const active = pick === b;
                                  const label = b ?? (r.keyword_report_buyer ? `Auto (${r.keyword_report_buyer})` : 'None');
                                  return (
                                    <button
                                      key={b ?? 'none'}
                                      type="button"
                                      role="radio"
                                      aria-checked={active}
                                      onClick={() => setDraft((d) => ({ ...d, [r.campaign_name]: b }))}
                                      className={`rounded-md px-3 py-1 text-xs transition-colors ${
                                        active ? 'bg-azure font-bold text-canvas' : 'font-medium text-ink-2 hover:text-ink'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {suffixed.length > 0 && (
                <p className="mt-4 text-xs leading-relaxed text-ink-3">
                  Named by suffix (change by renaming in Bing):{' '}
                  {suffixed.map((r, i) => (
                    <span key={r.campaign_name}>
                      {i > 0 && ' · '}
                      <span className="text-ink-2">{r.campaign_name}</span> → {r.media_buyer}
                    </span>
                  ))}
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-ink-3">
                Order: the <code>_th</code> / <code>_th2</code> suffix wins, then the pick made here, then the keyword report&apos;s Media
                Buyer column. “Auto” removes the pick made here. Keyword rows themselves always follow their own Media Buyer column.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Chip({ children }: { children: string }) {
  return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{children}</span>;
}
