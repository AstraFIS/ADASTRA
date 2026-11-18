/**
 * The backend's Facebook endpoints, running inside the browser for the offline (single HTML) copy
 * of the dashboard. The same controllers and services as the real server answer each request;
 * only the data comes from the embedded workbook rows instead of MongoDB.
 * Bundled by build-static.mjs; node-only modules (mongoose, fs, exceljs, …) are stubbed there.
 */
import type { Request, Response } from 'express';
import { DEMO_USER, useStaticStore } from '../src/config/demo.js';
import { getAdStatistics } from '../src/controllers/fbAdStatistics.controller.js';
import { getCampaigns } from '../src/controllers/fbCampaigns.controller.js';
import { getCharts } from '../src/controllers/fbCharts.controller.js';
import { getDailyTrend } from '../src/controllers/fbDailyTrend.controller.js';
import { getFunnel } from '../src/controllers/fbFunnel.controller.js';
import { getGeoDevice } from '../src/controllers/fbGeoDevice.controller.js';
import { getOptions } from '../src/controllers/fbOptions.controller.js';
import { getStatistics } from '../src/controllers/fbStatistics.controller.js';
import { getFacebookAdDetail, getFacebookDashboard } from '../src/services/facebook.service.js';

type Handler = (req: Request, res: Response) => Promise<void> | void;
type Doc = Record<string, unknown>;

const user = { id: DEMO_USER.id, email: DEMO_USER.email, role: 'admin' as const, access: DEMO_USER.access };

const dashboard: Handler = (req, res) => {
  const q = req.query as Record<string, string | string[] | undefined>;
  const single = (v: unknown) => (Array.isArray(v) ? (v.length === 1 ? v[0] : undefined) : v) as string | undefined;
  res.json(getFacebookDashboard({ dateRange: (single(q.range) as never) ?? 'this_month', ad: single(q.ad), offer: single(q.offer) }));
};

const ROUTES: [RegExp, Handler][] = [
  [/^\/platforms\/facebook\/statistics$/, getStatistics],
  [/^\/platforms\/facebook\/charts$/, getCharts],
  [/^\/platforms\/facebook\/geo-device$/, getGeoDevice],
  [/^\/platforms\/facebook\/daily-trend$/, getDailyTrend],
  [/^\/platforms\/facebook\/campaigns$/, getCampaigns],
  [/^\/platforms\/facebook\/funnel$/, getFunnel],
  [/^\/platforms\/facebook\/options$/, getOptions],
  [/^\/platforms\/facebook\/dashboard$/, dashboard],
  [/^\/platforms\/facebook\/ads\/([^/]+)\/statistics$/, getAdStatistics],
  [/^\/platforms\/facebook\/ads\/([^/]+)\/creative$/, (_q, res) => void res.json({ adName: null, links: [] })],
  [/^\/platforms\/facebook\/ads\/([^/]+)\/taxonomy$/, (_q, res) => void res.json({ taxonomy: null })],
  [
    /^\/platforms\/facebook\/ads\/([^/]+)$/,
    (req, res) => {
      const d = getFacebookAdDetail(String(req.params.adName), ((req.query as Doc).range as never) ?? 'this_month');
      if (!d) res.status(404).json({ error: 'Unknown ad' });
      else res.json(d);
    },
  ],
];

/** Dates arrive as ISO text in the embedded JSON; the pipelines expect Date objects. */
export function loadData(json: Record<string, Doc[]>): void {
  const fix = (rows: Doc[] = [], field: string) =>
    rows.map((r) => ({ ...r, [field]: r[field] ? new Date(String(r[field])) : null }));
  useStaticStore({
    facebook_ad_reports: fix(json.facebook_ad_reports, 'report_date'),
    facebook_conversions: fix(json.facebook_conversions, 'event_date'),
    facebook_providers: json.facebook_providers ?? [],
    ad_access: json.ad_access ?? [],
  });
}

/** Answers one API call: GET /platforms/facebook/... like the server, /auth/* as the demo admin. */
export async function handle(method: string, path: string): Promise<{ status: number; body: unknown }> {
  const url = new URL(path, 'http://offline');
  const p = url.pathname;
  if (p === '/auth/me') return { status: 200, body: { user: DEMO_USER } };
  if (p === '/auth/status') return { status: 200, body: { needsSetup: false, demo: true } };
  if (p === '/auth/login') return { status: 200, body: { token: 'offline', user: DEMO_USER } };
  if (method !== 'GET') return { status: 405, body: { error: 'This offline copy is read-only.' } };

  const query: Record<string, string | string[]> = {};
  for (const k of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(k);
    query[k] = all.length > 1 ? all : all[0]!;
  }
  for (const [re, handler] of ROUTES) {
    const m = re.exec(p);
    if (!m) continue;
    let status = 200;
    let body: unknown = null;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json(b: unknown) {
        body = b;
        return res;
      },
      setHeader() {
        return res;
      },
    } as unknown as Response;
    const req = { method, query, params: { adName: m[1] ? decodeURIComponent(m[1]) : undefined }, user } as unknown as Request;
    try {
      await handler(req, res);
    } catch (err) {
      const e = err as { status?: number; statusCode?: number; message?: string; issues?: unknown };
      return { status: e.status ?? e.statusCode ?? (e.issues ? 400 : 500), body: { error: e.message ?? 'Error' } };
    }
    return { status, body };
  }
  return { status: 404, body: { error: 'Only the Facebook pages are included in this offline copy.' } };
}
