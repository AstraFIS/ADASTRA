/**
 * Vercel serverless entry. Every request is rewritten here (see vercel.json)
 * and handed to the Express app. Everything is loaded lazily inside try/catch
 * so that a misconfigured deployment answers with a readable JSON error
 * (which variables are missing, why the database is unreachable) instead of
 * Vercel's opaque FUNCTION_INVOCATION_FAILED page. Local development still
 * uses src/index.ts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

let appPromise: Promise<RequestListener> | null = null;

async function loadApp(): Promise<RequestListener> {
  const { assertEnv } = await import('../src/config/env.js');
  assertEnv();
  const { createApp } = await import('../src/app.js');
  return createApp();
}

/** Keep error text useful but never echo a connection string. */
function safeMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/mongodb(\+srv)?:\/\/\S+/gi, 'mongodb://<redacted>');
}

function reply(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let app: RequestListener;
  try {
    appPromise ??= loadApp().catch((err: unknown) => {
      appPromise = null; // don't cache a failed start; the next request retries
      throw err;
    });
    app = await appPromise;
  } catch (err) {
    console.error('[vercel] startup failed', err);
    const problems = (err as { problems?: string[] }).problems;
    reply(
      res,
      500,
      problems
        ? { error: 'Server is not configured', problems, hint: 'Set these in Vercel → Project → Settings → Environment Variables, then redeploy.' }
        : { error: 'Server failed to start', reason: safeMessage(err) },
    );
    return;
  }

  try {
    const { connectDb } = await import('../src/config/db.js');
    await connectDb();
  } catch (err) {
    console.error('[vercel] database connection failed', err);
    reply(res, 503, {
      error: 'Database unavailable',
      reason: safeMessage(err),
      hint: 'Check MONGODB_URI and that MongoDB Atlas → Network Access allows 0.0.0.0/0.',
    });
    return;
  }

  app(req, res);
}
