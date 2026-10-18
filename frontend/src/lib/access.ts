import { BING_MEDIA_BUYERS, FACEBOOK_ACCESS_GROUPS, type AuthUser, type UserAccess } from '@/types/auth';
import type { PlatformId } from '@/types/platforms';

export const FULL_ACCESS: UserAccess = {
  facebook: [...FACEBOOK_ACCESS_GROUPS],
  google: true,
  microsoft: true,
  bing_buyers: [...BING_MEDIA_BUYERS],
};

/** The access that actually applies: admins see everything regardless of their stored list. Mirrors the backend. */
export function effectiveAccess(user: Pick<AuthUser, 'role' | 'access'>): UserAccess {
  // an older backend may not send bing_buyers yet
  return user.role === 'admin' ? FULL_ACCESS : { ...user.access, bing_buyers: user.access.bing_buyers ?? [] };
}

export function canSeePlatform(user: Pick<AuthUser, 'role' | 'access'> | null, platform: PlatformId): boolean {
  if (!user) return false;
  const access = effectiveAccess(user);
  return platform === 'facebook' ? access.facebook.length > 0 : access[platform];
}
