import 'dotenv/config';

function toPort(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
}

function required(name: string, opts: { minLength?: number } = {}): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (opts.minLength && value.length < opts.minLength) {
    throw new Error(`${name} must be at least ${opts.minLength} characters`);
  }
  return value;
}

/** Comma-separated list, e.g. "http://localhost:5173,https://adastra.vercel.app" */
function toList(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toPort(process.env.PORT, 4000),
  clientOrigins: toList(process.env.CLIENT_ORIGIN, ['http://localhost:5173']),
  // behind a reverse proxy / serverless platform the client IP arrives in X-Forwarded-For
  trustProxy: process.env.TRUST_PROXY === 'true' || Boolean(process.env.VERCEL),
  mongoUri: required('MONGODB_URI'),
  mongoDbName: process.env.MONGODB_DB_NAME ?? 'adastra',
  jwtSecret: required('JWT_SECRET', { minLength: 32 }),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
} as const;

export const isProd = env.nodeEnv === 'production';
