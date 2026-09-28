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
import { SEED_PROVIDERS, SEED_ROWS } from '../services/facebook.service.js';

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
  console.log(`[seed:facebook] ${inserted} inserted, ${updated} updated, ${await FacebookAdReport.countDocuments()} rows total`);
} finally {
  await disconnectDb();
}
