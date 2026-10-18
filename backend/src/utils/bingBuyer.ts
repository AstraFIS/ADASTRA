/**
 * Bing media buyers. Two sources say which buyer a row belongs to:
 *
 *   - ad reports / partner conversions: the suffix at the end of the campaign name
 *       "MenCare Vault SKAG_th"   → TH
 *       "MenCare Vault SKAG_th2"  → TH2   ("_th02" works too)
 *       "MenCare Vault SKAG"      → Unassigned (no known suffix)
 *   - keyword reports: the "Media Buyer" column ("TH", "TH2", "TH02" …)
 *   - a campaign WITHOUT a suffix that appears in the keyword report takes that report's
 *     Media Buyer (see campaignBuyerMap in bing.service.ts), so its ad-report rows and partner
 *     events follow the keywords. The suffix wins whenever there is one.
 *
 * Codes are compared case-insensitively with leading zeros dropped from the number,
 * so TH02 = TH2 and TH01 = TH1 = TH. To add a buyer, add its code here
 * (and in frontend/src/types/auth.ts).
 */
export const BING_MEDIA_BUYERS = ['TH', 'TH2'] as const;
export type BingMediaBuyer = (typeof BING_MEDIA_BUYERS)[number];

/** Rows with no known buyer (incl. partner events that carry no campaign). Admins only. */
export const UNASSIGNED_BUYER = 'Unassigned';
export type BingBuyerFilter = BingMediaBuyer | typeof UNASSIGNED_BUYER;

const KNOWN = BING_MEDIA_BUYERS as readonly string[];

/** "th02" → "TH2", "TH01" → "TH", " TH2 " → "TH2"; anything not in the list → null. */
export function normalizeBuyer(raw: unknown): BingMediaBuyer | null {
  if (typeof raw !== 'string') return null;
  const m = /^\s*([a-z]+)\s*0*(\d*)\s*$/i.exec(raw);
  if (!m) return null;
  const num = m[2] && m[2] !== '1' ? m[2] : '';
  const code = `${m[1]!.toUpperCase()}${num}`;
  return KNOWN.includes(code) ? (code as BingMediaBuyer) : null;
}

/** Regex source for one buyer code as stored/typed: TH2 → "TH0*2", TH → "TH(?:0*1)?". */
function codePattern(code: BingMediaBuyer): string {
  const [, letters, num] = /^([A-Z]+)(\d*)$/.exec(code)!;
  return num ? `${letters}0*${num}` : `${letters}(?:0*1)?`;
}
const campaignRe = (codes: readonly BingMediaBuyer[]) => new RegExp(`_(?:${codes.map(codePattern).join('|')})\\s*$`, 'i');
const codeRe = (codes: readonly BingMediaBuyer[]) => new RegExp(`^\\s*(?:${codes.map(codePattern).join('|')})\\s*$`, 'i');

/** "Campaign_th2" → "TH2"; no known suffix → "Unassigned". */
export function buyerOfCampaign(campaign: string | null | undefined): BingBuyerFilter {
  if (!campaign) return UNASSIGNED_BUYER;
  return BING_MEDIA_BUYERS.find((b) => campaignRe([b]).test(campaign)) ?? UNASSIGNED_BUYER;
}

/**
 * Mongo condition that keeps only the given buyers' rows.
 *   kind 'campaign' – `field` is a campaign name carrying the buyer suffix
 *   kind 'code'     – `field` holds the buyer code itself (keyword reports' media_buyer)
 * `null` = no restriction (admin, no buyer picked). An empty list matches nothing.
 */
export function buyerMatch(
  buyers: readonly BingBuyerFilter[] | null,
  kind: 'campaign' | 'code' = 'campaign',
  field = kind === 'campaign' ? 'campaign_name' : 'media_buyer',
  /** kind 'campaign' only: buyer of campaigns that carry no suffix (from the keyword report). */
  campaignBuyers: ReadonlyMap<string, BingMediaBuyer> = new Map(),
): Record<string, unknown> {
  if (buyers === null) return {};
  const re = kind === 'campaign' ? campaignRe : codeRe;
  const mapped = kind === 'campaign' ? [...campaignBuyers] : [];
  const named = buyers.filter((b): b is BingMediaBuyer => b !== UNASSIGNED_BUYER);
  const parts: Record<string, unknown>[] = [];
  if (named.length) {
    parts.push({ [field]: { $regex: re(named) } });
    const extra = mapped.filter(([, b]) => named.includes(b)).map(([c]) => c);
    if (extra.length) parts.push({ [field]: { $in: extra } });
  }
  // $not also matches a null / missing value (e.g. partner events without tracking)
  if (buyers.includes(UNASSIGNED_BUYER)) {
    const notSuffixed = { [field]: { $not: re(BING_MEDIA_BUYERS) } };
    parts.push(mapped.length ? { $and: [notSuffixed, { [field]: { $nin: mapped.map(([c]) => c) } }] } : notSuffixed);
  }
  if (parts.length === 0) return { [field]: { $in: [] } };
  return parts.length === 1 ? parts[0]! : { $or: parts };
}

interface BuyerUser {
  role: 'admin' | 'user';
  access: { bing_buyers: readonly BingMediaBuyer[] };
}

/**
 * Which buyers' rows a caller may see, narrowed by the page's buyer filter.
 * Admins: everything (null) or the picked buyer. Users: their own buyers, never Unassigned.
 */
export function bingBuyerScope(user: BuyerUser, picked?: BingBuyerFilter): BingBuyerFilter[] | null {
  if (user.role === 'admin') return picked ? [picked] : null;
  const own: BingBuyerFilter[] = [...user.access.bing_buyers];
  if (!picked) return own;
  return own.includes(picked) ? [picked] : [];
}

/** The choices for the page's buyer dropdown. */
export function buyerOptions(user: BuyerUser): BingBuyerFilter[] {
  return user.role === 'admin'
    ? [...BING_MEDIA_BUYERS, UNASSIGNED_BUYER]
    : BING_MEDIA_BUYERS.filter((b) => user.access.bing_buyers.includes(b));
}

/**
 * Buyer condition for keyword / search term rows. Their own Media Buyer column decides; a row whose
 * Media Buyer is blank (some exports leave it empty) falls back to its campaign's buyer
 * (suffix → admin pick → keyword report), so it is not lost under Unassigned.
 */
export function rowBuyerMatch(
  buyers: readonly BingBuyerFilter[] | null,
  campaignBuyers: ReadonlyMap<string, BingMediaBuyer> = new Map(),
): Record<string, unknown> {
  if (buyers === null) return {};
  const blank = { media_buyer: { $in: [null, ''] } };
  const notBlank = { media_buyer: { $nin: [null, ''] } };
  return {
    $or: [
      { $and: [notBlank, buyerMatch(buyers, 'code')] },
      { $and: [blank, buyerMatch(buyers, 'campaign', 'campaign_name', campaignBuyers)] },
    ],
  };
}
