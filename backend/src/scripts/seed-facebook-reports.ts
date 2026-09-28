/**
 * Loads the demo Facebook rows (the same data the seed-based dashboard uses)
 * into the `facebook_ad_reports` collection, so the statistics API has data.
 *
 *   npm run seed:facebook -w backend            # upserts, safe to re-run
 *   MONGODB_DB_NAME=adastra_test npm run seed:facebook -w backend
 */
import 'dotenv/config';
import { connectDb, disconnectDb } from '../config/db.js';
import { FacebookAdReport } from '../models/facebookAdReport.model.js';
import { AGE_BUCKETS, FacebookAudienceReport, GENDER_BUCKETS } from '../models/facebookAudienceReport.model.js';
import { SEED_AD_PROFILES, SEED_PROVIDERS, SEED_ROWS, apportion } from '../services/facebook.service.js';

await connectDb();
try {
  let inserted = 0;
  let updated = 0;
  for (const r of SEED_ROWS) {
    const feeRate = SEED_PROVIDERS.find((p) => p.name === r.provider)?.feeRate ?? 0;
    const before = await FacebookAdReport.countDocuments();
    await FacebookAdReport.upsertRow({
      report_date: new Date(`${r.date}T00:00:00Z`),
      ad_name: r.adName,
      offer_name: r.offer,
      campaign_name: `${r.offer} · seed`,
      ad_set_name: r.adName,
      provider_name: r.provider,
      provider_fee_pct: feeRate * 100,
      spend_usd: r.spend,
      impressions: r.impressions,
      clicks_all: r.linkClicks, // the demo data has no separate all-clicks count
      link_clicks: r.linkClicks,
      landing_page_views: r.landingPageViews,
      presell_visits: r.landingPageViews,
      first_page_views: r.landingPageViews,
      questionnaire_starts: r.qs,
      leads_partial: r.lead,
      add_to_carts: r.addToCart,
      purchase_events: r.purchase,
      conversions: r.purchase,
      revenue_usd: r.revenue,
    });
    (await FacebookAdReport.countDocuments()) > before ? inserted++ : updated++;
  }
  console.log(`[seed:facebook] reports: ${inserted} inserted, ${updated} updated, ${await FacebookAdReport.countDocuments()} rows total`);

  // audience breakdown rows: each day's link clicks / impressions split by the ad's demographic profile
  let audienceRows = 0;
  for (const r of SEED_ROWS) {
    const profile = SEED_AD_PROFILES[r.adName];
    if (!profile) continue;
    const date = new Date(`${r.date}T00:00:00Z`);
    const splits: [('age' | 'gender'), { key: string }[], number[]][] = [
      ['age', AGE_BUCKETS, profile.age],
      ['gender', GENDER_BUCKETS, profile.gender],
    ];
    for (const [breakdown, buckets, weights] of splits) {
      const clicks = apportion(r.linkClicks, weights);
      const impressions = apportion(r.impressions, weights);
      const spend = apportion(Math.round(r.spend * 100), weights);
      for (let i = 0; i < buckets.length; i++) {
        await FacebookAudienceReport.upsertRow({
          report_date: date,
          ad_name: r.adName,
          breakdown,
          bucket: buckets[i]!.key,
          impressions: impressions[i] ?? 0,
          clicks_all: clicks[i] ?? 0,
          link_clicks: clicks[i] ?? 0,
          spend_usd: (spend[i] ?? 0) / 100,
        });
        audienceRows++;
      }
    }
  }
  console.log(`[seed:facebook] audience: ${audienceRows} rows upserted, ${await FacebookAudienceReport.countDocuments()} rows total`);
} finally {
  await disconnectDb();
}
