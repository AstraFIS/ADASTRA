/**
 * MongoDB collection names for the Facebook data, in one place.
 *
 *   facebook_ad_reports  Meta Ads export (you upload) (name unchanged)
 *   partner_data  partner conversions export (you upload) — was facebook_conversions
 *   merged_data   Meta + partner joined, built by the backend; the dashboard reads this — never edit it
 *   facebook_providers  provider name + fee % (name unchanged)
 *   ad_access           ad name → Meta1 / Meta2 (name unchanged)
 */
export const COLLECTIONS = {
  meta: 'facebook_ad_reports',
  partner: 'partner_data',
  merged: 'merged_data',
  providers: 'facebook_providers',
  adGroups: 'ad_access',
} as const;
