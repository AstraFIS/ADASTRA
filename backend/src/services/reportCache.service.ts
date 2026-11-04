import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import { FacebookConversion } from '../models/facebookConversion.model.js';
import { FacebookProvider } from '../models/facebookProvider.model.js';

/**
 * Speed-ups for the Facebook dashboard.
 *
 * 1. Stored dates. Rows pasted into Atlas keep their day as text ("01/10/2026"), which no
 *    index can range over, so every request had to read and convert every row. Text days
 *    in facebook_ad_reports / facebook_conversions are converted to real Dates once (the
 *    same day, 00:00 UTC), after which reportAggregate filters by date on the index first.
 *    Text that is not a date is left as it is.
 *
 * 2. Response cache. The data only changes when rows are imported or groups are edited,
 *    so each Facebook API answer is kept (in memory and in the `api_cache` collection, so
 *    every serverless instance shares it) for up to CACHE_TTL_MS. It is keyed by the full
 *    URL plus the caller's role and access, and by a data version: the row counts of the
 *    report collections plus a counter bumped on every Ad groups save. Pasting new rows or
 *    saving groups therefore shows up on the next request; editing a value in place in
 *    Atlas shows up within CACHE_TTL_MS.
 */

const CACHE_TTL_MS = 5 * 60_000;
const VERSION_MEMO_MS = 5_000;
const NORMALIZE_EVERY_MS = 10 * 60_000;
const MEM_MAX = 300;
const DB_MAX_BYTES = 8 * 1024 * 1024;

interface CacheDoc {
  _id: string;
  version: string;
  body: string;
  expiresAt: Date;
}
interface MetaDoc {
  _id: string;
  v: number;
}

const cacheColl = () => mongoose.connection.collection<CacheDoc>('api_cache');
const metaColl = () => mongoose.connection.collection<MetaDoc>('app_meta');

const mem = new Map<string, { version: string; at: number; body: string }>();
let versionMemo: { value: string; at: number } | null = null;
let ttlIndexReady = false;

/** Rows in the report collections + the Ad groups save counter: changes whenever the data does. */
export async function dataVersion(): Promise<string> {
  if (versionMemo && Date.now() - versionMemo.at < VERSION_MEMO_MS) return versionMemo.value;
  const [reports, conversions, providers, meta] = await Promise.all([
    FacebookAdReport.collection.estimatedDocumentCount(),
    FacebookConversion.collection.estimatedDocumentCount(),
    FacebookProvider.collection.estimatedDocumentCount(),
    metaColl().findOne({ _id: 'fb_cache' }),
  ]);
  const value = `${reports}.${conversions}.${providers}.${meta?.v ?? 0}`;
  versionMemo = { value, at: Date.now() };
  return value;
}

/** Call after anything that changes what the reports show without changing row counts (group edits). */
export async function bumpDataVersion(): Promise<void> {
  mem.clear();
  versionMemo = null;
  await metaColl().updateOne({ _id: 'fb_cache' }, { $inc: { v: 1 } }, { upsert: true });
}

// ---------------------------------------------------------------------------
// 1. text days → Dates
// ---------------------------------------------------------------------------

/** "DD/MM/YYYY" (or ISO) text → Date at 00:00 UTC; anything unreadable is kept unchanged. */
const toDateExpr = (field: string) => {
  const f = `$${field}`;
  return {
    $dateFromString: {
      dateString: { $trim: { input: f } },
      format: '%d/%m/%Y',
      timezone: 'UTC',
      onError: { $dateFromString: { dateString: { $trim: { input: f } }, timezone: 'UTC', onError: f, onNull: f } },
      onNull: f,
    },
  };
};

async function convertTextDays(coll: mongoose.mongo.Collection, field: string): Promise<number> {
  const filter = { [field]: { $type: 'string' } };
  if (!(await coll.findOne(filter, { projection: { _id: 1 } }))) return 0;
  try {
    const res = await coll.updateMany(filter, [{ $set: { [field]: toDateExpr(field) } }]);
    return res.modifiedCount;
  } catch (err) {
    // a unique index can refuse a converted row that now equals an existing one: convert the rest one by one
    if ((err as { code?: number }).code !== 11000) throw err;
    let n = 0;
    for await (const doc of coll.find(filter, { projection: { _id: 1 } })) {
      try {
        const r = await coll.updateOne({ _id: doc._id, ...filter }, [{ $set: { [field]: toDateExpr(field) } }]);
        n += r.modifiedCount;
      } catch {
        // duplicate: leave this row as text (still read correctly, just not indexed)
      }
    }
    return n;
  }
}

let lastNormalized: { version: string; at: number } | null = null;
let normalizing: Promise<void> | null = null;

/** Converts text days once per data change (and at most every NORMALIZE_EVERY_MS otherwise). */
export function ensureDatesNormalized(version: string): Promise<void> {
  if (normalizing) return normalizing;
  if (lastNormalized && lastNormalized.version === version && Date.now() - lastNormalized.at < NORMALIZE_EVERY_MS) {
    return Promise.resolve();
  }
  normalizing = (async () => {
    try {
      const [a, b] = await Promise.all([
        convertTextDays(FacebookAdReport.collection as never, 'report_date'),
        convertTextDays(FacebookConversion.collection as never, 'event_date'),
      ]);
      if (a + b > 0) console.log(`[cache] converted ${a} report and ${b} conversion text dates to Dates`);
      lastNormalized = { version, at: Date.now() };
    } catch (err) {
      console.warn('[cache] date conversion skipped:', err instanceof Error ? err.message : err);
      lastNormalized = { version, at: Date.now() };
    } finally {
      normalizing = null;
    }
  })();
  return normalizing;
}

// ---------------------------------------------------------------------------
// 2. response cache (Express middleware for GET routes)
// ---------------------------------------------------------------------------

function keyFor(req: Request): string {
  const u = req.user;
  const raw = `${req.baseUrl}${req.url}|${u?.role ?? ''}|${JSON.stringify(u?.access ?? null)}`;
  return createHash('sha1').update(raw).digest('hex');
}

function remember(key: string, version: string, body: string) {
  if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value as string);
  mem.set(key, { version, at: Date.now(), body });
}

function send(res: Response, body: string, how: string) {
  res.set('X-Cache', how);
  res.type('application/json').send(body);
}

export async function cacheReports(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.method !== 'GET' || mongoose.connection.readyState !== 1) return next();
  try {
    const version = await dataVersion();
    await ensureDatesNormalized(version);
    const key = keyFor(req);

    const hit = mem.get(key);
    if (hit && hit.version === version && Date.now() - hit.at < CACHE_TTL_MS) return send(res, hit.body, 'hit-memory');

    const doc = await cacheColl().findOne({ _id: key, version, expiresAt: { $gt: new Date() } });
    if (doc) {
      remember(key, version, doc.body);
      return send(res, doc.body, 'hit-db');
    }

    if (!ttlIndexReady) {
      ttlIndexReady = true;
      cacheColl()
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
        .catch(() => (ttlIndexReady = false));
    }

    // compute as usual; store the answer before it goes out (serverless may freeze right after)
    const json = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode !== 200) return json(body);
      const text = JSON.stringify(body);
      remember(key, version, text);
      const store =
        text.length <= DB_MAX_BYTES
          ? cacheColl()
              .replaceOne({ _id: key }, { version, body: text, expiresAt: new Date(Date.now() + CACHE_TTL_MS) }, { upsert: true })
              .catch(() => undefined)
          : Promise.resolve();
      void store.then(() => send(res, text, 'miss'));
      return res;
    }) as Response['json'];
    next();
  } catch (err) {
    console.warn('[cache] bypassed:', err instanceof Error ? err.message : err);
    next();
  }
}
