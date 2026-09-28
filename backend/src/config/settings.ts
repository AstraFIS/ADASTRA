/**
 * Application settings, checked into the repository so the backend runs
 * anywhere without environment variables.
 *
 * SECURITY: these are live credentials inside Git. Keep the repository
 * private, and rotate the database password / JWT secret if it is ever
 * exposed. Any value can still be overridden by an environment variable
 * of the same name (see env.ts), so rotation never requires a code change.
 */
export const SETTINGS = {
  NODE_ENV: 'production',
  PORT: 4000,

  MONGODB_URI: 'mongodb+srv://aghababat_db_user:edevz9wuqWF6etfL@cluster0.uzswb51.mongodb.net/',
  MONGODB_DB_NAME: 'adastra',

  // 64 hex chars, generate with: openssl rand -hex 32
  JWT_SECRET: '534713276e7b386ebe67cfc8fb04f339be2c97d357c3f18f83ec9369f84d4fb7',
  JWT_EXPIRES_IN: '7d',

  /** Browser origins allowed to call the API. */
  CLIENT_ORIGINS: ['http://localhost:5173', 'http://localhost:4173'],
  /** Also allow every deployment of the frontend on Vercel (preview + production URLs). */
  ALLOW_VERCEL_ORIGINS: true,
} as const;
