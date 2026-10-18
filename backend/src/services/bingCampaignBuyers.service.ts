/**
 * "Campaign buyers" section on the Bing page (admins): every Bing campaign with the media buyer
 * it currently belongs to and why, and saving manual TH / TH2 picks for campaigns whose name
 * has no _th / _th2 suffix (stored in bing_campaign_buyers).
 */
import { BingAdReport } from '../models/bingAdReport.model.js';
import { BingCampaignBuyer } from '../models/bingCampaignBuyer.model.js';
import { BingConversion } from '../models/bingConversion.model.js';
import { BingKeywordReport } from '../models/bingKeywordReport.model.js';
import { UNASSIGNED_BUYER, buyerOfCampaign, type BingBuyerFilter, type BingMediaBuyer } from '../utils/bingBuyer.js';
import { HttpError } from '../utils/httpError.js';
import { keywordCampaignBuyers, manualCampaignBuyers } from './bing.service.js';

/** Where a campaign's buyer comes from. */
export type CampaignBuyerSource = 'suffix' | 'manual' | 'keyword_report' | 'none';

export interface CampaignBuyerRow {
  campaign_name: string;
  media_buyer: BingBuyerFilter;
  source: CampaignBuyerSource;
  /** What the keyword report says, shown as a hint even when a manual pick overrides it. */
  keyword_report_buyer: BingMediaBuyer | null;
  /** Which collections mention the campaign. */
  in_ad_reports: boolean;
  in_keyword_reports: boolean;
  in_partner_events: boolean;
  spend_usd: number; // ad report + keyword report spend are shown separately below
  ad_spend_usd: number;
  keyword_spend_usd: number;
  partner_events: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function totals(model: 'ads' | 'keywords' | 'partner'): Promise<Map<string, number>> {
  const group =
    model === 'partner'
      ? { $group: { _id: '$campaign_name', v: { $sum: 1 } } }
      : { $group: { _id: '$campaign_name', v: { $sum: '$spend_usd' } } };
  const pipeline = [{ $match: { campaign_name: { $nin: [null, ''] } } }, group];
  const rows =
    model === 'ads'
      ? await BingAdReport.aggregate<{ _id: string; v: number }>(pipeline)
      : model === 'keywords'
        ? await BingKeywordReport.aggregate<{ _id: string; v: number }>(pipeline)
        : await BingConversion.aggregate<{ _id: string; v: number }>(pipeline);
  return new Map(rows.map((r) => [r._id, r.v]));
}

export async function listCampaignBuyers(): Promise<{ campaigns: CampaignBuyerRow[] }> {
  const [ads, kws, partner, fromKeywords, manual] = await Promise.all([
    totals('ads'),
    totals('keywords'),
    totals('partner'),
    keywordCampaignBuyers(),
    manualCampaignBuyers(),
  ]);
  const names = new Set([...ads.keys(), ...kws.keys(), ...partner.keys(), ...manual.keys()]);

  const campaigns = [...names].map((name): CampaignBuyerRow => {
    const suffix = buyerOfCampaign(name);
    const [media_buyer, source]: [BingBuyerFilter, CampaignBuyerSource] =
      suffix !== UNASSIGNED_BUYER
        ? [suffix, 'suffix']
        : manual.has(name)
          ? [manual.get(name)!, 'manual']
          : fromKeywords.has(name)
            ? [fromKeywords.get(name)!, 'keyword_report']
            : [UNASSIGNED_BUYER, 'none'];
    const adSpend = round2(ads.get(name) ?? 0);
    const kwSpend = round2(kws.get(name) ?? 0);
    return {
      campaign_name: name,
      media_buyer,
      source,
      keyword_report_buyer: fromKeywords.get(name) ?? null,
      in_ad_reports: ads.has(name),
      in_keyword_reports: kws.has(name),
      in_partner_events: partner.has(name),
      // the two reports cover the same clicks, so show the larger rather than adding them
      spend_usd: Math.max(adSpend, kwSpend),
      ad_spend_usd: adSpend,
      keyword_spend_usd: kwSpend,
      partner_events: partner.get(name) ?? 0,
    };
  });

  // unassigned first, then by spend
  const rank = (r: CampaignBuyerRow) => (r.source === 'none' ? 0 : 1);
  campaigns.sort((a, b) => rank(a) - rank(b) || b.spend_usd - a.spend_usd || a.campaign_name.localeCompare(b.campaign_name));
  return { campaigns };
}

/**
 * Saves manual picks. `media_buyer: null` removes the pick (the campaign falls back to the
 * keyword report, or Unassigned). Campaigns with a suffix cannot be overridden — rename them instead.
 */
export async function saveCampaignBuyers(
  assignments: { campaign_name: string; media_buyer: BingMediaBuyer | null }[],
): Promise<{ campaigns: CampaignBuyerRow[] }> {
  const suffixed = assignments.filter((a) => buyerOfCampaign(a.campaign_name) !== UNASSIGNED_BUYER);
  if (suffixed.length) {
    throw new HttpError(400, `These campaigns already name their buyer with a suffix: ${suffixed.map((a) => a.campaign_name).join(', ')}`);
  }
  const ops = assignments.map((a) =>
    a.media_buyer
      ? {
          updateOne: {
            filter: { campaign_name: a.campaign_name },
            update: { $set: { campaign_name: a.campaign_name, media_buyer: a.media_buyer } },
            upsert: true,
          },
        }
      : { deleteOne: { filter: { campaign_name: a.campaign_name } } },
  );
  if (ops.length) await BingCampaignBuyer.bulkWrite(ops);
  return listCampaignBuyers();
}
