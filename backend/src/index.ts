import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';

async function main() {
  await connectDb();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[backend] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string) => {
    console.log(`[backend] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
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
