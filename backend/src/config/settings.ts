/**
 * Application settings, checked into the repository so the backend runs
 * anywhere without environment variables.
 *
 * Fill in the two PASTE_* values from backend/.env (MONGODB_URI and JWT_SECRET).
 *
 * SECURITY: once filled in, these are live credentials inside Git. Keep the
 * repository private, and rotate the database password / JWT secret if it is
 * ever exposed. Any value can still be overridden by an environment variable
 * of the same name (see env.ts), so rotation never requires a code change.
 */
export const SETTINGS = {
  NODE_ENV: 'production',
  PORT: 4000,

  MONGODB_URI: 'PASTE_MONGODB_URI_HERE',
  MONGODB_DB_NAME: 'adastra',

  // 64 hex chars, generate with: openssl rand -hex 32
  JWT_SECRET: 'PASTE_JWT_SECRET_HERE',
  JWT_EXPIRES_IN: '7d',

  /** Browser origins allowed to call the API. */
  CLIENT_ORIGINS: ['http://localhost:5173', 'http://localhost:4173'],
  /** Also allow every deployment of the frontend on Vercel (preview + production URLs). */
  ALLOW_VERCEL_ORIGINS: true,
} as const;
