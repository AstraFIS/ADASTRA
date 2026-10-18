export type UserRole = 'admin' | 'user';

/** Facebook ad groups, as stored in the `ad_access` collection. */
export const FACEBOOK_ACCESS_GROUPS = ['Meta1', 'Meta2'] as const;
export type FacebookAccessGroup = (typeof FACEBOOK_ACCESS_GROUPS)[number];

/**
 * Bing media buyers (mirrors backend/src/utils/bingBuyer.ts). Read from the campaign-name
 * suffix (_th, _th2) and from the keyword report's Media Buyer column (TH02 = TH2).
 */
export const BING_MEDIA_BUYERS = ['TH', 'TH2'] as const;
export type BingMediaBuyer = (typeof BING_MEDIA_BUYERS)[number];
/** Rows with no known buyer — only admins see and filter them. */
export const UNASSIGNED_BUYER = 'Unassigned';
export type BingBuyerFilter = BingMediaBuyer | typeof UNASSIGNED_BUYER;

/** What a user may see. Admins always see everything, whatever is stored here. */
export interface UserAccess {
  facebook: FacebookAccessGroup[];
  google: boolean;
  microsoft: boolean;
  /** Bing media buyers whose data the user sees. */
  bing_buyers: BingMediaBuyer[];
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
