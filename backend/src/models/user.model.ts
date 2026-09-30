import bcrypt from 'bcryptjs';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { FACEBOOK_ACCESS_GROUPS, type FacebookAccessGroup } from './adAccess.model.js';

export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const BCRYPT_ROUNDS = 12;

/**
 * What a user may see. Facebook access is per ad group (see the `ad_access`
 * collection); Google and Bing are all-or-nothing. Admins always see everything,
 * whatever is stored here — use effectiveAccess() when deciding.
 */
export interface UserAccess {
  facebook: FacebookAccessGroup[];
  google: boolean;
  microsoft: boolean;
}

export const FULL_ACCESS: UserAccess = { facebook: [...FACEBOOK_ACCESS_GROUPS], google: true, microsoft: true };

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  access: UserAccess;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export interface UserModel extends Model<IUser, object, IUserMethods> {
  hashPassword(plain: string): Promise<string>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;

/** The shape we expose over the API — never includes the password hash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  access: UserAccess;
  lastLoginAt: string | null;
  createdAt: string;
}

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select: false keeps the hash out of every query unless explicitly asked for
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'user' },
    isActive: { type: Boolean, default: true },
    // accounts created before access lists existed keep the full access they had
    access: {
      facebook: {
        type: [{ type: String, enum: FACEBOOK_ACCESS_GROUPS }],
        default: () => [...FULL_ACCESS.facebook],
      },
      google: { type: Boolean, default: true },
      microsoft: { type: Boolean, default: true },
    },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    methods: {
      comparePassword(candidate: string) {
        return bcrypt.compare(candidate, this.passwordHash);
      },
    },
    statics: {
      hashPassword(plain: string) {
        return bcrypt.hash(plain, BCRYPT_ROUNDS);
      },
    },
  },
);

export const User = model<IUser, UserModel>('User', userSchema);

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    access: {
      facebook: [...(user.access?.facebook ?? [])],
      google: user.access?.google ?? false,
      microsoft: user.access?.microsoft ?? false,
    },
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** The access that actually applies: admins see everything regardless of their stored list. */
export function effectiveAccess(user: { role: UserRole; access?: UserAccess | null }): UserAccess {
  if (user.role === 'admin') return FULL_ACCESS;
  return {
    facebook: [...(user.access?.facebook ?? [])],
    google: user.access?.google ?? false,
    microsoft: user.access?.microsoft ?? false,
  };
}
