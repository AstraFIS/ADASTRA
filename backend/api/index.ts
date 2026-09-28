/**
 * Vercel serverless entry. Every request is rewritten here (see vercel.json);
 * the Express app handles routing. The database connection is opened lazily
 * and cached per warm instance. Local development still uses src/index.ts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/app.js';
import { connectDb } from '../src/config/db.js';

const app = createApp();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await connectDb();
  } catch (err) {
    console.error('[vercel] database connection failed', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Database unavailable' }));
    return;
  }
  app(req, res);
}
