/**
 * Loads the two Bing collections from the JSON files produced by tools/bing/build_bing.py:
 *
 *   bing_ad_reports.json   → bing_ad_reports   (Bing Ads export)
 *   bing_conversions.json  → bing_conversions  (partner export)
 *
 * Dates may be "DD/MM/YYYY" text ("01/10/2026" = 1 Oct 2026) or {"$date": …}; both are stored as real Dates.
 *
 * For each file, every existing document inside the file's date span is replaced, so
 * re-importing an updated export never duplicates rows; days outside the span are kept.
 *
 *   npm run import:bing -w backend -- <folder with the two json files>            # dry run
 *   npm run import:bing -w backend -- <folder with the two json files> --apply
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { connectDb, disconnectDb } from '../config/db.js';
import { BingAdReport } from '../models/bingAdReport.model.js';
import { BingConversion } from '../models/bingConversion.model.js';
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
    { file: 'bing_ad_reports.json', model: BingAdReport, dateField: 'report_date' },
    { file: 'bing_conversions.json', model: BingConversion, dateField: 'event_date' },
  ] as const;

  for (const job of jobs) {
    const docs = await load(job.file);
    if (docs.length === 0) {
      console.log(`  ${job.file}: empty, skipped`);
      continue;
    }
    const { from, to } = span(docs, job.dateField);
    const filter = { [job.dateField]: { $gte: from, $lte: to } };
    // validate every document against the schema before touching the collection
    const model = job.model as unknown as typeof BingAdReport;
    for (const [i, d] of docs.entries()) {
      try {
        await new model(d).validate();
      } catch (err) {
        throw new Error(`${job.file} row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
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
