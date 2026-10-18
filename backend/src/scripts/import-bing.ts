/**
 * Loads the Bing collections from the JSON files produced by tools/bing/build_bing.py and
 * tools/bing/build_keywords.py:
 *
 *   bing_ad_reports.json       → bing_ad_reports       (Bing Ads "Ad" export)
 *   bing_conversions.json      → bing_conversions      (partner export)
 *   bing_keyword_reports.json  → bing_keyword_reports  (Bing Ads "Keyword" export, with Media Buyer)
 *   bing_search_terms.json     → bing_search_terms     (Bing Ads "Search terms" export, with Media Buyer)
 *
 * Any file missing from the folder is skipped, so one export can be loaded on its own.
 *
 * Dates may be "DD/MM/YYYY" text ("01/10/2026" = 1 Oct 2026) or {"$date": …}; both are stored as real Dates.
 *
 * For each file, the existing documents inside the file's date span are replaced, so
 * re-importing an updated export never duplicates rows; days outside the span are kept.
 * The replace is limited to what the file covers, so media buyers can export separately:
 * ad reports → only the campaigns in the file, keyword / search term reports → only the media buyers in the file
 * (the partner export covers every buyer, so it replaces the whole span).
 *
 *   npm run import:bing -w backend -- <folder with the json files>            # dry run
 *   npm run import:bing -w backend -- <folder with the json files> --apply
 */
import 'dotenv/config';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { connectDb, disconnectDb } from '../config/db.js';
import { BingAdReport } from '../models/bingAdReport.model.js';
import { BingConversion } from '../models/bingConversion.model.js';
import { BingKeywordReport } from '../models/bingKeywordReport.model.js';
import { BingSearchTerm } from '../models/bingSearchTerm.model.js';
import { parseDayMonthYear } from '../utils/bingDate.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('Usage: npm run import:bing -w backend -- <folder> [--apply]');
  process.exit(1);
}

/** Extended JSON → plain values: {"$date": "..."} becomes a Date. */
function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$date === 'string' && Object.keys(o).length === 1) return new Date(o.$date);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, revive(v)]));
  }
  return value;
}

async function load(file: string): Promise<Record<string, unknown>[]> {
  const raw = JSON.parse(await readFile(path.resolve(dir!, file), 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error(`${file}: expected a JSON array`);
  return raw.map((r) => revive(r) as Record<string, unknown>);
}

function span(docs: Record<string, unknown>[], field: string): { from: Date; to: Date } {
  const times = docs.map((d) => {
    const v = parseDayMonthYear(d[field]);
    if (!(v instanceof Date) || Number.isNaN(v.getTime())) throw new Error(`Unreadable ${field}: ${JSON.stringify(d[field])} (use DD/MM/YYYY)`);
    d[field] = v;
    return v.getTime();
  });
  return { from: new Date(Math.min(...times)), to: new Date(Math.max(...times)) };
}

await connectDb();
try {
  console.log(`[import:bing] ${APPLY ? 'APPLY' : 'DRY RUN'} from ${path.resolve(dir)}`);

  const jobs = [
    { file: 'bing_ad_reports.json', model: BingAdReport, dateField: 'report_date', scopeField: 'campaign_name' },
    { file: 'bing_conversions.json', model: BingConversion, dateField: 'event_date', scopeField: null },
    { file: 'bing_keyword_reports.json', model: BingKeywordReport, dateField: 'report_date', scopeField: 'media_buyer' },
    { file: 'bing_search_terms.json', model: BingSearchTerm, dateField: 'report_date', scopeField: 'media_buyer' },
  ] as const;

  for (const job of jobs) {
    const exists = await access(path.resolve(dir, job.file)).then(() => true, () => false);
    if (!exists) {
      console.log(`  ${job.file}: not in the folder, skipped`);
      continue;
    }
    const docs = await load(job.file);
    if (docs.length === 0) {
      console.log(`  ${job.file}: empty, skipped`);
      continue;
    }
    const { from, to } = span(docs, job.dateField);
    // validate (and cast, e.g. media buyer "TH02" → "TH2") every document before touching the collection
    const model = job.model as unknown as typeof BingAdReport;
    for (const [i, d] of docs.entries()) {
      try {
        const doc = new model(d);
        await doc.validate();
        docs[i] = doc.toObject({ depopulate: true, versionKey: false }) as Record<string, unknown>;
        delete docs[i]!._id;
      } catch (err) {
        throw new Error(`${job.file} row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const filter: Record<string, unknown> = { [job.dateField]: { $gte: from, $lte: to } };
    if (job.scopeField) {
      const values = [...new Set(docs.map((d) => d[job.scopeField] ?? null))];
      filter[job.scopeField] = { $in: values };
      console.log(`  ${job.file}: replacing only ${job.scopeField} = ${values.map((v) => JSON.stringify(v)).join(', ')}`);
    }
    const existing = await model.countDocuments(filter);
    console.log(
      `  ${job.model.collection.name}: ${docs.length} docs for ${from.toISOString().slice(0, 10)} … ${to.toISOString().slice(0, 10)} ` +
        `(replaces ${existing} existing)`,
    );
    if (APPLY) {
      // drop indexes the schema no longer defines before inserting, so a leftover unique index cannot reject rows
      await model.syncIndexes();
      await model.deleteMany(filter);
      await model.insertMany(docs, { ordered: false });
      console.log(`    → imported`);
    }
  }
  if (!APPLY) console.log('Dry run only — add --apply to write.');
} finally {
  await disconnectDb();
}
