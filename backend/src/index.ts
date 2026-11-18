import 'dotenv/config'; // optional local overrides; settings.ts holds the defaults
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { DEMO, EXCEL_FILE, refreshDemoStore } from './config/demo.js';
import { connectDb, disconnectDb } from './config/db.js';
import { assertEnv, env } from './config/env.js';

async function main() {
  assertEnv();
  if (DEMO) {
    // Excel mode: no MongoDB at all; the Facebook reports read the workbook (see config/demo.ts)
    mongoose.set('bufferCommands', false); // pages that need the database fail fast instead of waiting
    console.log(`[excel] MongoDB is NOT used. Data: ${EXCEL_FILE}  (set DATA_SOURCE=mongo to use the database)`);
    await refreshDemoStore();
  } else {
    await connectDb();
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[backend] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    console.log(`[backend] ${signal} received, shutting down`);
    server.close(async () => {
      if (!DEMO) await disconnectDb();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[backend] failed to start', err);
  process.exit(1);
});
