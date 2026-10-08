import { Schema, model } from 'mongoose';

/**
 * Links an admin typed in on the "Ad groups" page. One row per ad in the
 * `ad_creatives` collection. A field that is null / missing means "no override"
 * (the frontend falls back to creatives.json); an empty string means "cleared on purpose".
 */
export interface IAdCreative {
  ad_name: string;
  image_url: string | null;
  video_url: string | null;
  landing_url: string | null;
}

const link = { type: String, trim: true, maxlength: 2048, default: null };

const adCreativeSchema = new Schema<IAdCreative>(
  { ad_name: { type: String, required: true, trim: true }, image_url: link, video_url: link, landing_url: link },
  { collection: 'ad_creatives', versionKey: false },
);

export const AdCreative = model<IAdCreative>('AdCreative', adCreativeSchema);
