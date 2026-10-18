import { Schema, model, type Model } from 'mongoose';
import { BING_MEDIA_BUYERS, type BingMediaBuyer } from '../utils/bingBuyer.js';

/**
 * Manual campaign → media buyer assignment, set by admins on the Bing page
 * ("Campaign buyers" section) for campaigns whose name has no _th / _th2 suffix.
 *
 * Which buyer a campaign belongs to, first match wins:
 *   1. the suffix in its name      ("…_th2" → TH2)
 *   2. this collection             (admin's pick)
 *   3. the keyword report          (its Media Buyer column)
 *   otherwise Unassigned (admins only).
 */
export interface IBingCampaignBuyer {
  campaign_name: string;
  media_buyer: BingMediaBuyer;
}

const bingCampaignBuyerSchema = new Schema<IBingCampaignBuyer>(
  {
    campaign_name: { type: String, required: true, trim: true, maxlength: 300, unique: true },
    media_buyer: { type: String, required: true, enum: BING_MEDIA_BUYERS },
  },
  { collection: 'bing_campaign_buyers', timestamps: true },
);

export const BingCampaignBuyer: Model<IBingCampaignBuyer> = model<IBingCampaignBuyer>('BingCampaignBuyer', bingCampaignBuyerSchema);
