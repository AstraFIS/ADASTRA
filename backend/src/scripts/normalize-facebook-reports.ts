/**
 * Normalises field types in facebook_ad_reports for rows that were imported
 * without going through the Mongoose model:
 *   - ad_name / offer_name / campaign_name / ad_set_name / provider_name stored
 *     as numbers become strings (an ad literally named 3.1 → "3.1")
 *   - empty-string provider_name becomes null
 *   - age / gender are normalised to the canonical bucket keys ("Not available" → "unknown",
 *     "Male" → "male", missing → "unknown")
 *   - the old unique index (date, ad, campaign, ad set) is replaced by one that also
 *     includes age and gender, so breakdown rows can coexist
 *   - provider_fee_pct given as 638 (meaning 6.38 %) is divided by 100
 *   - every derived column (provider_fee_usd, total_spend_usd, ctr_all, cpc_usd,
 *     gross_profit_usd, net_profit_usd, roas_pct, cac_usd) is recomputed from the
 *     base numbers, replacing imported values that were wrong or stored as text
 *
 * Dry run by default (reports what would change). Pass --apply to write.
 *
 *   npm run normalize:facebook -w backend            # dry run
 *   npm run normalize:facebook -w backend -- --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { FacebookAdReport, normaliseBucket } from '../models/facebookAdReport.model.js';

const APPLY = process.argv.includes('--apply');
const TEXT_FIELDS = ['ad_name', 'offer_name', 'campaign_name', 'ad_set_name', 'provider_name'] as const;

await connectDb();
try {
  const col = mongoose.connection.db!.collection('facebook_ad_reports');
  console.log(`[normalize] ${APPLY ? 'APPLY' : 'DRY RUN'} on ${mongoose.connection.name}.facebook_ad_reports (${await col.countDocuments()} docs)`);

  // ---- empty rows: no date and no ad name (blank spreadsheet lines) are unusable ----
  const emptyFilter = { $and: [{ $or: [{ report_date: { $exists: false } }, { report_date: null }] }, { $or: [{ ad_name: { $exists: false } }, { ad_name: null }, { ad_name: '' }] }] };
  const empty = await col.countDocuments(emptyFilter);
  if (empty) {
    console.log(`  ${empty} empty row(s) with no report_date and no ad_name`);
    if (APPLY) console.log(`    → deleted ${(await col.deleteMany(emptyFilter)).deletedCount}`);
  }
  const dateless = await col.countDocuments({ ...{ report_date: { $not: { $type: 'date' } } }, ad_name: { $exists: true, $nin: [null, ''] } });
  if (dateless) console.log(`  WARNING: ${dateless} row(s) have an ad_name but no valid report_date — they are ignored by every endpoint; fix the date or remove them by hand`);

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

  for (const field of ['age', 'gender'] as const) {
    const raw = await col.aggregate<{ _id: unknown; n: number }>([{ $group: { _id: `$${field}`, n: { $sum: 1 } } }]).toArray();
    const changes = raw.filter((r) => normaliseBucket(r._id) !== r._id);
    if (changes.length === 0) continue;
    console.log(`  ${field}: ${changes.reduce((n, r) => n + r.n, 0)} docs need normalising (${changes.map((r) => `${JSON.stringify(r._id)} → ${JSON.stringify(normaliseBucket(r._id))}`).join(', ')})`);
    if (APPLY) {
      for (const r of changes) {
        const filter = r._id === null || r._id === undefined ? { [field]: { $in: [null, undefined] } } : { [field]: r._id };
        const res = await col.updateMany(filter, { $set: { [field]: normaliseBucket(r._id) } });
        console.log(`    → ${JSON.stringify(r._id)}: ${res.modifiedCount}`);
      }
    }
  }

  const indexes = await col.indexes();
  const legacy = indexes.find((i) => i.unique && Object.keys(i.key).join('+') === 'report_date+ad_name+campaign_name+ad_set_name');
  if (legacy) {
    console.log(`  legacy unique index "${legacy.name}" (without age/gender) is present`);
    if (APPLY) {
      await col.dropIndex(legacy.name!);
      await FacebookAdReport.syncIndexes();
      console.log('    → dropped; indexes now:', (await col.indexes()).map((i) => i.name).join(', '));
    }
  }

  // ---- provider_fee_pct sanity: a fee cannot exceed 100 %; 638 means 6.38 ----
  const badPct = await col.countDocuments({ provider_fee_pct: { $gt: 100 } });
  if (badPct) {
    const vals = await col.distinct('provider_fee_pct', { provider_fee_pct: { $gt: 100 } });
    console.log(`  provider_fee_pct: ${badPct} docs hold ${vals.join(', ')} → will become ${vals.map((v) => v / 100).join(', ')}`);
    if (APPLY) console.log(`    → fixed ${(await col.updateMany({ provider_fee_pct: { $gt: 100 } }, [{ $set: { provider_fee_pct: { $divide: ['$provider_fee_pct', 100] } } }])).modifiedCount}`);
  }

  // ---- derived columns: recompute from the base numbers through the model's own save hook ----
  const DERIVED = ['provider_fee_usd', 'total_spend_usd', 'ctr_all', 'cpc_usd', 'gross_profit_usd', 'net_profit_usd', 'roas_pct', 'cac_usd'] as const;
  const textDerived = await col.countDocuments({ $or: DERIVED.map((f) => ({ [f]: { $type: 'string' } })) });
  const missingBase = await col.countDocuments({ $or: ['spend_usd', 'revenue_usd', 'impressions', 'link_clicks'].map((f) => ({ [f]: { $exists: false } })) });
  console.log(`  derived columns: ${textDerived} docs hold text values; ${missingBase} docs lack base numbers (they will be treated as 0)`);
  if (APPLY) {
    let saved = 0;
    for await (const doc of FacebookAdReport.find().cursor()) {
      // touching a base field forces the pre-validate hook to recompute every derived value
      doc.markModified('spend_usd');
      await doc.save();
      saved++;
    }
    console.log(`    → recomputed ${saved} docs`);
    const [t] = await col.aggregate([{ $group: { _id: null, spend: { $sum: '$spend_usd' }, fee: { $sum: '$provider_fee_usd' }, total: { $sum: '$total_spend_usd' } } }]).toArray();
    console.log(`    → totals now: spend ${t?.spend?.toFixed(2)} + fees ${t?.fee?.toFixed(2)} = ${t?.total?.toFixed(2)}`);
  } else {
    // preview what the totals would become
    const rows = await col.find({}, { projection: { spend_usd: 1, provider_fee_pct: 1 } }).toArray();
    const preview = rows.reduce((acc, r) => {
      const spend = Number(r.spend_usd) || 0;
      let pct = Number(r.provider_fee_pct) || 0;
      if (pct > 100) pct /= 100;
      const fee = Math.round(spend * pct) / 100;
      return { spend: acc.spend + spend, fee: acc.fee + fee, total: acc.total + spend + fee };
    }, { spend: 0, fee: 0, total: 0 });
    const [now] = await col.aggregate([{ $group: { _id: null, fee: { $sum: '$provider_fee_usd' }, total: { $sum: '$total_spend_usd' } } }]).toArray();
    console.log(`    currently summed: fees ${now?.fee?.toFixed(2)}, total ${now?.total?.toFixed(2)} → after recompute: spend ${preview.spend.toFixed(2)} + fees ${preview.fee.toFixed(2)} = ${preview.total.toFixed(2)}`);
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
