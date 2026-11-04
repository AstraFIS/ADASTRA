import { BingAdReport } from '../models/bingAdReport.model.js';
import { BingConversion } from '../models/bingConversion.model.js';
import { PartnerOffer, type PartnerPlatform } from '../models/partnerOffer.model.js';
import { reportAggregate } from './fbStatistics.service.js';

export interface PartnerOfferRow {
  platform: PartnerPlatform;
  offer_name: string;
  partner_name: string | null;
  partner_login: string | null;
  /** false when the offer is only in partner_offers (no report rows any more). */
  in_data: boolean;
}

export interface PartnerOfferInput {
  platform: PartnerPlatform;
  offer_name: string;
  /** empty / null partner removes the assignment */
  partner_name: string | null;
  partner_login: string | null;
}

const clean = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s === '' || s === 'null' ? null : s;
};

/** Every offer in the Facebook and Bing data, with its partner and login (if set). */
export async function listPartnerOffers(): Promise<PartnerOfferRow[]> {
  const [fb, bingAds, bingConv, saved] = await Promise.all([
    reportAggregate<{ _id: unknown }>([{ $group: { _id: '$offer_name' } }]),
    BingAdReport.distinct('offer_name') as Promise<unknown[]>,
    BingConversion.distinct('offer_name') as Promise<unknown[]>,
    PartnerOffer.find({}).lean(),
  ]);
  const rows = new Map<string, PartnerOfferRow>();
  const put = (platform: PartnerPlatform, offer: unknown, inData: boolean) => {
    const name = clean(offer);
    if (!name) return;
    const key = `${platform}|${name}`;
    if (!rows.has(key)) rows.set(key, { platform, offer_name: name, partner_name: null, partner_login: null, in_data: inData });
  };
  fb.forEach((r) => put('facebook', r._id, true));
  [...bingAds, ...bingConv].forEach((o) => put('bing', o, true));
  for (const s of saved) {
    put(s.platform, s.offer_name, false);
    const row = rows.get(`${s.platform}|${s.offer_name}`)!;
    row.partner_name = clean(s.partner_name);
    row.partner_login = clean(s.partner_login);
  }
  return [...rows.values()].sort(
    (a, b) => a.platform.localeCompare(b.platform) || a.offer_name.localeCompare(b.offer_name, undefined, { numeric: true }),
  );
}

export async function savePartnerOffers(items: PartnerOfferInput[]): Promise<number> {
  let n = 0;
  for (const it of items) {
    const partner = clean(it.partner_name);
    const filter = { platform: it.platform, offer_name: it.offer_name.trim() };
    if (!partner) {
      n += (await PartnerOffer.deleteOne(filter)).deletedCount;
    } else {
      await PartnerOffer.updateOne(filter, { $set: { partner_name: partner, partner_login: clean(it.partner_login) } }, { upsert: true });
      n += 1;
    }
  }
  return n;
}

/** platform|offer → partner + login, for the Finance page. */
export async function partnerMap(): Promise<Map<string, { partner: string; login: string | null }>> {
  const rows = await PartnerOffer.find({}, { platform: 1, offer_name: 1, partner_name: 1, partner_login: 1, _id: 0 }).lean();
  return new Map(rows.map((r) => [`${r.platform}|${r.offer_name}`, { partner: r.partner_name, login: clean(r.partner_login) }]));
}
