import { AdAccess } from '../models/adAccess.model.js';
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
 */
export async function facebookAdScope(user: { role: UserRole; access: UserAccess }): Promise<string[] | null> {
  if (user.role === 'admin') return null;
  if (user.access.facebook.length === 0) return [];

  const rows = await AdAccess.find({ user_access_type: { $in: user.access.facebook } }, { ad_name: 1, _id: 0 }).lean();
  const names = rows.map((r) => String(r.ad_name ?? '').trim()).filter(Boolean);
  return [...new Set(names)];
}
