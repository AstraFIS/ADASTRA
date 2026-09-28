/**
 * Normalises field types in facebook_ad_reports for rows that were imported
 * without going through the Mongoose model:
 *   - ad_name / offer_name / campaign_name / ad_set_name / provider_name stored
 *     as numbers become strings (an ad literally named 3.1 → "3.1")
 *   - empty-string provider_name becomes null
 *
 * Dry run by default (reports what would change). Pass --apply to write.
 *
 *   npm run normalize:facebook -w backend            # dry run
 *   npm run normalize:facebook -w backend -- --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';

const APPLY = process.argv.includes('--apply');
const TEXT_FIELDS = ['ad_name', 'offer_name', 'campaign_name', 'ad_set_name', 'provider_name'] as const;

await connectDb();
try {
  const col = mongoose.connection.db!.collection('facebook_ad_reports');
  console.log(`[normalize] ${APPLY ? 'APPLY' : 'DRY RUN'} on ${mongoose.connection.name}.facebook_ad_reports (${await col.countDocuments()} docs)`);

  for (const field of TEXT_FIELDS) {
    const filter = { [field]: { $type: ['double', 'int', 'long', 'decimal'] } };
    const n = await col.countDocuments(filter);
    if (n === 0) continue;
    const values = await col.distinct(field, filter);
    console.log(`  ${field}: ${n} docs hold a number (${values.slice(0, 10).map(String).join(', ')}${values.length > 10 ? ', …' : ''})`);
    if (APPLY) {
      const res = await col.updateMany(filter, [{ $set: { [field]: { $toString: `$${field}` } } }]);
      console.log(`    → converted ${res.modifiedCount}`);
    }
  }

  const emptyProvider = await col.countDocuments({ provider_name: '' });
  if (emptyProvider) {
    console.log(`  provider_name: ${emptyProvider} docs hold "" (should be null)`);
    if (APPLY) console.log(`    → set to null: ${(await col.updateMany({ provider_name: '' }, { $set: { provider_name: null } })).modifiedCount}`);
  }

  const dupes = await col
    .aggregate([
      { $group: { _id: { d: '$report_date', a: { $toString: '$ad_name' }, c: '$campaign_name', s: '$ad_set_name' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 5 },
    ])
    .toArray();
  if (dupes.length) {
    console.log(`  WARNING: ${dupes.length}+ (date, ad, campaign, ad set) keys exist both as number and text — the unique index would reject conversion for those; resolve them first:`);
    for (const d of dupes) console.log('    ', JSON.stringify(d._id));
  } else {
    console.log('  no number/text duplicates on the unique key');
  }
  if (!APPLY) console.log('[normalize] dry run only — re-run with --apply to write these changes');
} finally {
  await disconnectDb();
}
