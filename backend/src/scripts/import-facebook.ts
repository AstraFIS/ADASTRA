/**
 * Loads the three Facebook collections from the JSON files written by
 * tools/facebook/build_facebook.py:
 *
 *   facebook_ad_reports.json   → facebook_ad_reports   (Facebook Ads export: spend, delivery)
 *   facebook_conversions.json  → facebook_conversions  (partner events: funnel + revenue)
 *   facebook_providers.json    → facebook_providers    (provider fee %, one default)
 *
 * Report and conversion files replace every existing document inside the file's own
 * date span (whether that document stored its date as a Date or as "DD/MM/YYYY" text),
 * so re-importing an updated export never duplicates rows; other days are kept.
 * Providers are upserted by name. A missing file is skipped.
 *
 * The dashboard reads facebook_ad_reports + facebook_conversions + facebook_providers
 * (see BLENDED_REPORT_ROWS).
 *
 *   npm run import:facebook -w backend -- <folder>            # dry run
 *   npm run import:facebook -w backend -- <folder> --apply
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Model } from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import { FacebookConversion } from '../models/facebookConversion.model.js';
import { FacebookProvider } from '../models/facebookProvider.model.js';
import { dayExpr, parseDayMonthYear } from '../utils/bingDate.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('Usage: npm run import:facebook -w backend -- <folder> [--apply]');
  process.exit(1);
}

type Doc = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one helper serves three different schemas
type AnyModel = Model<any>;

async function load(file: string): Promise<Doc[] | null> {
  const full = path.resolve(dir!, file);
  if (!existsSync(full)) return null;
  const raw = JSON.parse(await readFile(full, 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error(`${file}: expected a JSON array`);
  return raw as Doc[];
}

/** "DD/MM/YYYY" / {"$date": …} / ISO → Date (day first, never US month-first); returns the span. */
function toDates(docs: Doc[], field: string, file: string): { from: Date; to: Date } {
  let min = Infinity;
  let max = -Infinity;
  docs.forEach((d, i) => {
    const raw = d[field];
    const v = parseDayMonthYear(raw && typeof raw === 'object' && '$date' in raw ? (raw as { $date: string }).$date : raw);
    const date = v instanceof Date ? v : new Date(NaN);
    if (Number.isNaN(date.getTime())) throw new Error(`${file} row ${i + 1}: unreadable ${field} ${JSON.stringify(raw)} (use DD/MM/YYYY)`);
    d[field] = date;
    min = Math.min(min, date.getTime());
    max = Math.max(max, date.getTime());
  });
  return { from: new Date(min), to: new Date(max) };
}

/** Ids of documents whose day (Date or text) falls inside the span. */
async function idsInSpan(model: AnyModel, field: string, span: { from: Date; to: Date }): Promise<unknown[]> {
  const rows = await model.aggregate<{ _id: unknown }>([
    { $project: { _d: dayExpr(field) } },
    { $match: { _d: { $gte: span.from, $lte: span.to } } },
    { $project: { _id: 1 } },
  ]);
  return rows.map((r) => r._id);
}

async function validateAll(model: AnyModel, docs: Doc[], file: string): Promise<void> {
  for (const [i, d] of docs.entries()) {
    try {
      await new model(d).validate();
    } catch (err) {
      throw new Error(`${file} row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

await connectDb();
try {
  console.log(`[import:facebook] ${APPLY ? 'APPLY' : 'DRY RUN'} from ${path.resolve(dir)}`);

  // ---- providers first: the fee % every other number depends on ----
  const providers = await load('facebook_providers.json');
  if (providers) {
    await validateAll(FacebookProvider as unknown as AnyModel, providers, 'facebook_providers.json');
    const defaults = providers.filter((p) => p.is_default === true);
    if (defaults.length > 1) throw new Error('facebook_providers.json: more than one provider has is_default: true');
    console.log(`  facebook_providers: ${providers.length} providers${defaults[0] ? ` (default: ${String(defaults[0].provider_name)})` : ''}`);
    if (APPLY) {
      await FacebookProvider.syncIndexes();
      if (defaults.length) await FacebookProvider.updateMany({}, { $set: { is_default: false } });
      for (const p of providers) {
        await FacebookProvider.updateOne(
          { provider_name: String(p.provider_name).trim() },
          { $set: { fee_pct: Number(p.fee_pct), is_default: p.is_default === true } },
          { upsert: true },
        );
      }
      console.log('    → upserted');
    }
  } else console.log('  facebook_providers.json: not found, skipped');

  // ---- report rows and partner events: replace by date span ----
  const jobs = [
    { file: 'facebook_ad_reports.json', model: FacebookAdReport as unknown as AnyModel, field: 'report_date' },
    { file: 'facebook_conversions.json', model: FacebookConversion as unknown as AnyModel, field: 'event_date' },
  ];
  for (const job of jobs) {
    const docs = await load(job.file);
    if (!docs) {
      console.log(`  ${job.file}: not found, skipped`);
      continue;
    }
    if (docs.length === 0) {
      console.log(`  ${job.file}: empty, skipped`);
      continue;
    }
    const span = toDates(docs, job.field, job.file);
    await validateAll(job.model, docs, job.file);
    const existing = await idsInSpan(job.model, job.field, span);
    console.log(
      `  ${job.model.collection.name}: ${docs.length} docs for ${iso(span.from)} … ${iso(span.to)} (replaces ${existing.length} existing)`,
    );
    if (APPLY) {
      // drop indexes the schema no longer defines (e.g. a leftover unique index from an older
      // collection with the same name) before inserting, so they cannot reject the new rows
      await job.model.syncIndexes();
      for (let i = 0; i < existing.length; i += 1000) {
        await job.model.deleteMany({ _id: { $in: existing.slice(i, i + 1000) } });
      }
      for (let i = 0; i < docs.length; i += 1000) {
        await job.model.insertMany(docs.slice(i, i + 1000), { ordered: false });
      }
      console.log('    → imported');
    }
  }
  if (!APPLY) console.log('Dry run only — add --apply to write.');
} finally {
  await disconnectDb();
}
