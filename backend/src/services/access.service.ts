import { AdAccess, type FacebookAccessGroup } from '../models/adAccess.model.js';
import type { UserAccess, UserRole } from '../models/user.model.js';
import type { PlatformId } from '../types/platforms.js';

export function hasPlatformAccess(access: UserAccess, platform: PlatformId): boolean {
  if (platform === 'facebook') return access.facebook.length > 0;
  return access[platform];
}

/**
 * The Facebook ad names a user may see, or null for "every ad" (admins only).
 * For everyone else each ad's group is looked up in `ad_access` by ad_name and
 * the ad is visible only when that group is on the user's list, so ads not
 * listed in `ad_access` are hidden from non-admins. Read on every request so
 * access changes apply immediately.
 *
 * `group` narrows the result to one group's ads (the dashboard's Meta1 / Meta2
 * filter); asking for a group the user does not have yields no ads.
 */
export async function facebookAdScope(
  user: { role: UserRole; access: UserAccess },
  group?: FacebookAccessGroup,
): Promise<string[] | null> {
  const isAdmin = user.role === 'admin';
  if (group) return isAdmin || user.access.facebook.includes(group) ? adsInGroups([group]) : [];
  if (isAdmin) return null;
  return user.access.facebook.length ? adsInGroups(user.access.facebook) : [];
}

async function adsInGroups(groups: FacebookAccessGroup[]): Promise<string[]> {
  const rows = await AdAccess.find({ user_access_type: { $in: groups } }, { ad_name: 1, _id: 0 }).lean();
  const names = rows.map((r) => String(r.ad_name ?? '').trim()).filter(Boolean);
  return [...new Set(names)];
}
