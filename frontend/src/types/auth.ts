export type UserRole = 'admin' | 'user';

/** Facebook ad groups, as stored in the `ad_access` collection. */
export const FACEBOOK_ACCESS_GROUPS = ['Meta1', 'Meta2'] as const;
export type FacebookAccessGroup = (typeof FACEBOOK_ACCESS_GROUPS)[number];

/** What a user may see. Admins always see everything, whatever is stored here. */
export interface UserAccess {
  facebook: FacebookAccessGroup[];
  google: boolean;
  microsoft: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  access: UserAccess;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AuthStatus {
  needsSetup: boolean;
}
