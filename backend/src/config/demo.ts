/**
 * Excel mode: the backend runs WITHOUT MongoDB and fills the Facebook reports straight from
 * the merged Excel workbook (tools/facebook/demo/GLP1_DAMS_merged_13-17Nov.xlsx):
 *
 *   "Meta raw"    → Facebook rows (day × campaign × ad set × ad × gender × age: spend, delivery)
 *   "Partner raw" → partner events (day × ad × event, placement = sub2, device, region, category)
 *   "Summary" C6  → the provider fee % (the yellow input cell)
 *
 * It is ON by default when you run the app on your own computer and the workbook exists — no
 * .env needed. It is OFF on Vercel (live site) and when DATA_SOURCE=mongo is set.
 *   DATA_SOURCE=excel | mongo   force one or the other
 *   EXCEL_DATA=<path.xlsx>      use another workbook with the same sheets
 * Save the workbook and refresh the page: the file is re-read when it changes.
 * Any email / password signs in as a demo admin. Pages that need other collections
 * (Bing, Finance, Users, Ad groups) show an error in this mode.
 */
import { COLLECTIONS } from './collections.js';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { Aggregator } from 'mingo';
import 'mingo/init/system';
import { normaliseBucket } from '../models/facebookAdReport.model.js';
import type { PublicUser } from '../models/user.model.js';
import { FULL_ACCESS } from '../models/user.model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKBOOK = 'GLP1_DAMS_merged_13-17Nov.xlsx';

function excelPath(): string {
  if (process.env.EXCEL_DATA) return path.resolve(process.env.EXCEL_DATA);
  const candidates = [
    path.resolve(here, '../../../tools/facebook/demo', WORKBOOK), // backend/src/config (tsx)
    path.resolve(here, '../../../../tools/facebook/demo', WORKBOOK), // backend/dist/src/config (build)
    path.resolve(process.cwd(), '../tools/facebook/demo', WORKBOOK),
    path.resolve(process.cwd(), 'tools/facebook/demo', WORKBOOK),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}

const source = (process.env.DATA_SOURCE ?? '').trim().toLowerCase();
export const EXCEL_FILE = excelPath();
/** True = no MongoDB, the Excel workbook is the data. */
export const DEMO =
  source === 'excel' || (source !== 'mongo' && !process.env.VERCEL && existsSync(EXCEL_FILE));

/** Provider (ad account) of the Meta rows in the workbook. */
const PROVIDER = process.env.EXCEL_PROVIDER?.trim() || 'DAMS Aleph';

type Doc = Record<string, unknown>;

// ---------------------------------------------------------------------------
// reading the workbook
// ---------------------------------------------------------------------------

/** A cell's plain value: formulas give their result, rich text its text. */
function plain(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return plain((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as { text: string }).text;
    if ('error' in v) return null;
  }
  return v;
}

/** Sheet → array of { header: value } objects (first row = headers). */
function rows(ws: ExcelJS.Worksheet | undefined): Doc[] {
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (headers[i] = String(plain(c.value) ?? '').trim()));
  const out: Doc[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const d: Doc = {};
    row.eachCell({ includeEmpty: false }, (c, i) => {
      if (headers[i]) d[headers[i]!] = plain(c.value);
    });
    out.push(d);
  });
  return out;
}

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s === '' || ['<NA>', 'nan', 'NaN', 'None', 'null'].includes(s) ? null : s;
};
const number = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
};

/** "2026-11-13", "13/11/2026", "13/11/2026 08:09" or a Date → that day at UTC midnight. */
function toDay(v: unknown): Date | null {
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return null;
}

const NO_AD = '(no ad name)';
/** Partner ad name from sub4 "<ad id>_<ad name>"; an unfilled "{{ad.name}}" macro → no ad name. */
function adFromSub4(sub4: string | null): { id: string | null; name: string } {
  if (!sub4) return { id: null, name: NO_AD };
  const m = /^(\d+)_(.*)$/.exec(sub4);
  const name = (m ? m[2]! : sub4).replace(/\+/g, ' ').trim();
  return { id: m ? m[1]! : null, name: !name || name.includes('{{') ? NO_AD : name };
}
const cleanAd = (v: unknown): string => {
  const s = text(v);
  return !s || s.includes('{{') ? NO_AD : s.replace(/\+/g, ' ').trim();
};

const STAGE: Record<string, string> = {
  'presell visit': 'presell_visit',
  'first page view': 'first_page_view',
  'questionnaire started': 'questionnaire_start',
  'questionnaire start': 'questionnaire_start',
  'lead / partial': 'questionnaire_completed',
  lead: 'questionnaire_completed',
  'questionnaire completed': 'questionnaire_completed',
  addtocart: 'add_to_cart',
  'add to cart': 'add_to_cart',
  purchase: 'purchase',
};
const PLACEMENT: Record<string, string> = { an: 'Audience Network', '{{placement}}': '(not filled)' };

/** Most frequent value. */
function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function readWorkbook(file: string): Promise<Record<string, Doc[]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  // ---- partner events ----
  const partner: Doc[] = [];
  for (const r of rows(wb.getWorksheet('Partner raw'))) {
    const day = toDay(r['day (from date)'] ?? r['date']);
    const rawEvent = text(r['event_name']);
    const stage = rawEvent ? STAGE[rawEvent.toLowerCase()] : undefined;
    if (!day || !stage) continue;
    const sub4 = text(r['sub4']);
    const ad = adFromSub4(sub4);
    const sub2 = text(r['sub2']);
    partner.push({
      event_date: day,
      offer_name: text(r['offer_name']) ?? '(unknown offer)',
      event_raw: rawEvent,
      event_stage: stage,
      sub_id: sub4,
      fb_ad_id: ad.id,
      ad_name: ad.name,
      event_count: number(r['event_count_1'] ?? 1) || 1,
      revenue_usd: number(r['revenue']),
      device: text(r['device_type']),
      region: text(r['region']),
      placement: sub2 ? (PLACEMENT[sub2] ?? sub2) : null,
      category: text(r['Category']),
      login_user: text(r['Login_user']),
    });
  }

  // each ad's offer and category come from the partner (the Meta export has neither)
  const byAd = new Map<string, { offers: string[]; cats: string[] }>();
  for (const p of partner) {
    const e = byAd.get(p.ad_name as string) ?? { offers: [], cats: [] };
    e.offers.push(p.offer_name as string);
    if (p.category) e.cats.push(p.category as string);
    byAd.set(p.ad_name as string, e);
  }
  const allOffers = [...new Set(partner.map((p) => p.offer_name as string))];
  const allCats = [...new Set(partner.map((p) => p.category).filter(Boolean) as string[])];

  // ---- provider fee: Summary!C6 (0.06 = 6 %) ----
  const feeCell = plain(wb.getWorksheet('Summary')?.getCell('C6').value ?? null);
  const feeFraction = number(feeCell);
  const feePct = feeFraction > 1 ? feeFraction : feeFraction * 100;

  // ---- Meta rows, summed per day × campaign × ad set × ad × gender × age ----
  const meta = new Map<string, Doc>();
  for (const r of rows(wb.getWorksheet('Meta raw'))) {
    const day = toDay(r['Day']);
    if (!day) continue;
    const ad = cleanAd(r['Ad name']);
    const age = String(text(r['Age']) ?? 'unknown') === '65' ? '65+' : normaliseBucket(r['Age']);
    const gender = normaliseBucket(r['Gender']);
    const campaign = text(r['Campaign name']) ?? '(no campaign)';
    const adSet = text(r['Ad set name']) ?? '(no ad set)';
    const key = [day.toISOString(), campaign, adSet, ad, gender, age].join('|');
    let d = meta.get(key);
    if (!d) {
      const info = byAd.get(ad);
      const cat = (info && mode(info.cats)) ?? (allCats.length === 1 ? allCats[0] : null);
      d = {
        report_date: day,
        campaign_name: campaign,
        ad_set_name: adSet,
        ad_name: ad,
        offer_name: (info && mode(info.offers)) ?? (allOffers.length === 1 ? allOffers[0] : '(unknown offer)'),
        gender,
        age,
        provider_name: PROVIDER,
        provider_fee_pct: feePct,
        ...(cat ? { category: cat } : {}),
        spend_usd: 0,
        impressions: 0,
        clicks_all: 0,
        link_clicks: 0,
        landing_page_views: 0,
        presell_visits: 0,
        first_page_views: 0,
        questionnaire_starts: 0,
        questionnaire_completed: 0,
        add_to_carts: 0,
        purchase_events: 0,
        conversions: 0,
        revenue_usd: 0,
      };
      meta.set(key, d);
    }
    d.spend_usd = (d.spend_usd as number) + number(r['Amount spent (USD)']);
    d.impressions = (d.impressions as number) + number(r['Impressions']);
    d.clicks_all = (d.clicks_all as number) + number(r['Clicks (all)']);
    d.link_clicks = (d.link_clicks as number) + number(r['Link clicks']);
    d.landing_page_views = (d.landing_page_views as number) + number(r['Landing page views']);
  }

  let id = 0;
  const withId = (d: Doc) => ({ _id: `x${++id}`, ...d });
  return {
    facebook_ad_reports: [...meta.values()].map(withId),
    facebook_conversions: partner.map(withId),
    facebook_providers: [{ _id: 'p1', provider_name: PROVIDER, fee_pct: feePct, is_default: true }],
    ad_access: [],
  };
}

// ---------------------------------------------------------------------------
// the in-memory store, re-read whenever the workbook is saved
// ---------------------------------------------------------------------------

let store: Record<string, Doc[]> = { facebook_ad_reports: [], facebook_conversions: [], facebook_providers: [], ad_access: [] };
let loadedMtime = -1;
let loading: Promise<void> | null = null;

/** Loads (or reloads, if the file changed) the workbook. Call before reading the store. */
export async function refreshDemoStore(): Promise<void> {
  if (!DEMO) return;
  let mtime: number;
  try {
    mtime = statSync(EXCEL_FILE).mtimeMs;
  } catch {
    throw new Error(`Excel data file not found: ${EXCEL_FILE}`);
  }
  if (mtime === loadedMtime) return;
  loading ??= (async () => {
    try {
      store = await readWorkbook(EXCEL_FILE);
      loadedMtime = mtime;
      console.log(
        `[excel] ${store.facebook_ad_reports!.length} Meta rows + ${store.facebook_conversions!.length} partner events from ${EXCEL_FILE}`,
      );
    } finally {
      loading = null;
    }
  })();
  await loading;
}

/** Changes whenever the workbook is re-read (its modification time). */
export function demoVersion(): string {
  return `excel:${loadedMtime}`;
}

/** The loaded collections (call refreshDemoStore first). */
export function demoStore(): Record<string, Doc[]> {
  return store;
}

/** Collection name used in a pipeline → the in-memory list that plays it. */
const STORE_KEY: Record<string, string> = {
  [COLLECTIONS.meta]: 'facebook_ad_reports',
  [COLLECTIONS.partner]: 'facebook_conversions',
  [COLLECTIONS.providers]: 'facebook_providers',
  [COLLECTIONS.adGroups]: 'ad_access',
};
const storeKey = (name: string) => STORE_KEY[name] ?? name;

let reportRows: { mtime: number; rows: Doc[] } | null = null;

/**
 * Runs a report pipeline over the merged rows (Meta + partner, fees applied), which are built
 * from the workbook once per file change — the in-memory twin of facebook_report_rows.
 */
export async function demoReportAggregate<T>(blend: unknown[], pipeline: unknown[]): Promise<T[]> {
  await refreshDemoStore();
  if (!reportRows || reportRows.mtime !== loadedMtime) {
    const t = Date.now();
    reportRows = { mtime: loadedMtime, rows: await demoAggregate<Doc>(COLLECTIONS.meta, blend) };
    console.log(`[excel] merged ${reportRows.rows.length} report rows in ${Date.now() - t} ms`);
  }
  const data = store;
  const agg = new Aggregator(pipeline as never, { collectionResolver: (name: string) => data[storeKey(name)] ?? [] } as never);
  return agg.run(reportRows.rows) as T[];
}

/** Runs a MongoDB aggregation pipeline over the workbook data (in memory, via mingo). */
export async function demoAggregate<T>(collection: string, pipeline: unknown[]): Promise<T[]> {
  await refreshDemoStore();
  const data = store;
  const agg = new Aggregator(pipeline as never, { collectionResolver: (name: string) => data[storeKey(name)] ?? [] } as never);
  return agg.run(data[storeKey(collection)] ?? []) as T[];
}

export const DEMO_USER: PublicUser = {
  id: 'demo-admin',
  name: 'Excel demo',
  email: 'demo@adastra.local',
  role: 'admin',
  isActive: true,
  access: {
    facebook: [...FULL_ACCESS.facebook],
    google: FULL_ACCESS.google,
    microsoft: FULL_ACCESS.microsoft,
    bing_buyers: [...FULL_ACCESS.bing_buyers],
  },
  lastLoginAt: null,
  createdAt: new Date(0).toISOString(),
};
