/**
 * Loads the demo Facebook rows (the same data the seed-based dashboard uses)
 * into the `facebook_ad_reports` collection, split into age × gender breakdown
 * rows like a Facebook demographic export, so every DB-driven endpoint has data.
 *
 *   npm run seed:facebook -w backend            # upserts, safe to re-run
 *   MONGODB_DB_NAME=adastra_test npm run seed:facebook -w backend
 */
import 'dotenv/config';
import { connectDb, disconnectDb } from '../config/db.js';
import { AGE_BUCKETS, FacebookAdReport, GENDER_BUCKETS } from '../models/facebookAdReport.model.js';
import { SEED_AD_PROFILES, SEED_PROVIDERS, SEED_ROWS, apportion } from '../services/facebook.service.js';

await connectDb();
try {
  let upserted = 0;
  for (const r of SEED_ROWS) {
    const feeRate = SEED_PROVIDERS.find((p) => p.name === r.provider)?.feeRate ?? 0;
    const profile = SEED_AD_PROFILES[r.adName];
    const ageW = profile?.age ?? AGE_BUCKETS.map((_, i) => (i === 6 ? 1 : 0));
    const genderW = profile?.gender ?? GENDER_BUCKETS.map((_, i) => (i === 2 ? 1 : 0));

    // one weight per age × gender combination; the row's totals are split across them exactly
    const combos = AGE_BUCKETS.flatMap((age, i) => GENDER_BUCKETS.map((gender, j) => ({ age: age.key, gender: gender.key, w: (ageW[i] ?? 0) * (genderW[j] ?? 0) })));
    const weights = combos.map((c) => c.w);
    const split = (total: number) => apportion(total, weights);
    const spend = split(Math.round(r.spend * 100));
    const revenue = split(Math.round(r.revenue * 100));
    const impressions = split(r.impressions);
    const clicks = split(r.linkClicks);
    const lpv = split(r.landingPageViews);
    const qs = split(r.qs);
    const lead = split(r.lead);
    const atc = split(r.addToCart);
    const purchase = split(r.purchase);

    for (let k = 0; k < combos.length; k++) {
      const c = combos[k]!;
      const any = [spend[k], revenue[k], impressions[k], clicks[k], lpv[k], qs[k], lead[k], atc[k], purchase[k]].some((v) => (v ?? 0) > 0);
      if (!any) continue;
      await FacebookAdReport.upsertRow({
        report_date: new Date(`${r.date}T00:00:00Z`),
        ad_name: r.adName,
        offer_name: r.offer,
        campaign_name: `${r.offer} · seed`,
        ad_set_name: r.adName,
        age: c.age,
        gender: c.gender,
        provider_name: r.provider,
        provider_fee_pct: feeRate * 100,
        spend_usd: (spend[k] ?? 0) / 100,
        impressions: impressions[k] ?? 0,
        clicks_all: clicks[k] ?? 0, // the demo data has no separate all-clicks count
        link_clicks: clicks[k] ?? 0,
        landing_page_views: lpv[k] ?? 0,
        presell_visits: lpv[k] ?? 0,
        first_page_views: lpv[k] ?? 0,
        questionnaire_starts: qs[k] ?? 0,
        questionnaire_completed: lead[k] ?? 0,
        add_to_carts: atc[k] ?? 0,
        purchase_events: purchase[k] ?? 0,
        conversions: purchase[k] ?? 0,
        revenue_usd: (revenue[k] ?? 0) / 100,
      });
      upserted++;
    }
  }
  console.log(`[seed:facebook] ${upserted} breakdown rows upserted, ${await FacebookAdReport.countDocuments()} rows total`);
} finally {
  await disconnectDb();
}
