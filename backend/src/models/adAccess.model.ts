import { Schema, model } from 'mongoose';

/** Facebook ad groups a user can be given access to (values as stored in `ad_access.user_access_type`). */
export const FACEBOOK_ACCESS_GROUPS = ['Meta1', 'Meta2'] as const;
export type FacebookAccessGroup = (typeof FACEBOOK_ACCESS_GROUPS)[number];

/**
 * One row of the `ad_access` collection: which access group a Facebook ad
 * belongs to. Rows are loaded directly into Mongo, so `ad_name` may arrive as
 * a number (an ad called 3) — read it with String() rather than trusting the type.
 */
export interface IAdAccess {
  ad_name: string | number;
  user_access_type: FacebookAccessGroup;
}

const adAccessSchema = new Schema<IAdAccess>(
  {
    ad_name: { type: Schema.Types.Mixed, required: true },
    user_access_type: { type: String, required: true, enum: FACEBOOK_ACCESS_GROUPS },
  },
  { collection: 'ad_access', versionKey: false },
);

export const AdAccess = model<IAdAccess>('AdAccess', adAccessSchema);
