import { SETTINGS } from './settings.js';

/**
 * Runtime configuration. Defaults come from settings.ts (checked in); an
 * environment variable of the same name overrides a value when present.
 */
const read = (name: keyof typeof SETTINGS): string | undefined => {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
};

function toPort(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

/** Comma-separated list, e.g. "http://localhost:5173,https://adastra.vercel.app" */
function toList(value: string | undefined, fallback: readonly string[]): string[] {
  const items = (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : [...fallback];
}

export const env = {
  nodeEnv: read('NODE_ENV') ?? SETTINGS.NODE_ENV,
  port: toPort(read('PORT'), SETTINGS.PORT),
  clientOrigins: toList(process.env.CLIENT_ORIGIN, SETTINGS.CLIENT_ORIGINS),
  allowVercelOrigins: SETTINGS.ALLOW_VERCEL_ORIGINS,
  // behind a reverse proxy / serverless platform the client IP arrives in X-Forwarded-For
  trustProxy: process.env.TRUST_PROXY === 'true' || Boolean(process.env.VERCEL),
  mongoUri: read('MONGODB_URI') ?? SETTINGS.MONGODB_URI,
  mongoDbName: read('MONGODB_DB_NAME') ?? SETTINGS.MONGODB_DB_NAME,
  jwtSecret: read('JWT_SECRET') ?? SETTINGS.JWT_SECRET,
  jwtExpiresIn: read('JWT_EXPIRES_IN') ?? SETTINGS.JWT_EXPIRES_IN,
} as const;

export const isProd = env.nodeEnv === 'production';

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Server is not configured: ${problems.join('; ')}`);
    this.name = 'ConfigError';
  }
}

/** Sanity-checks the effective configuration (settings.ts defaults + env overrides). */
export function assertEnv(): void {
  const problems: string[] = [];
  if (!env.mongoUri || env.mongoUri.startsWith('PASTE_')) {
    problems.push('MONGODB_URI is not set: fill it in src/config/settings.ts (or set the MONGODB_URI variable)');
  }
  if (env.jwtSecret.startsWith('PASTE_') || env.jwtSecret.length < 32) {
    problems.push('JWT_SECRET is not set or shorter than 32 characters: fill it in src/config/settings.ts (or set the JWT_SECRET variable)');
  }
  if (problems.length) throw new ConfigError(problems);
}
