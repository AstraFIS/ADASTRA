import { AdAccess, FACEBOOK_ACCESS_GROUPS } from '../models/adAccess.model.js';
import type { UserAccess } from '../models/user.model.js';
import type { PlatformId } from '../types/platforms.js';

export function hasPlatformAccess(access: UserAccess, platform: PlatformId): boolean {
  if (platform === 'facebook') return access.facebook.length > 0;
  return access[platform];
}

/** True when the access covers every Facebook ad group, i.e. no ad filter is needed. */
function seesAllFacebookAds(access: UserAccess): boolean {
  return FACEBOOK_ACCESS_GROUPS.every((g) => access.facebook.includes(g));
}

/**
 * The Facebook ad names a user may see, or null for "every ad". Users with
 * every group (and admins) are unrestricted, so ads not yet listed in
 * `ad_access` stay visible to them; anyone else sees only the ads listed for
 * their groups. Read on every request so access changes apply immediately.
 */
export async function facebookAdScope(access: UserAccess): Promise<string[] | null> {
  if (seesAllFacebookAds(access)) return null;
  if (access.facebook.length === 0) return [];

  const rows = await AdAccess.find({ user_access_type: { $in: access.facebook } }, { ad_name: 1, _id: 0 }).lean();
  const names = rows.map((r) => String(r.ad_name ?? '').trim()).filter(Boolean);
  return [...new Set(names)];
}
