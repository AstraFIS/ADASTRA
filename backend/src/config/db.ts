import mongoose from 'mongoose';
import { env } from './env.js';

export type DbState = 'disconnected' | 'connected' | 'connecting' | 'disconnecting';

const READY_STATES: Record<number, DbState> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

let listenersAttached = false;
let connecting: Promise<void> | null = null;

/**
 * Connects once and reuses the connection. Safe to call on every request:
 * serverless platforms keep the module (and this promise) alive between
 * invocations on a warm instance, so only cold starts pay for a connection.
 */
export function connectDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (connecting) return connecting;

  if (!listenersAttached) {
    listenersAttached = true;
    mongoose.set('strictQuery', true);
    mongoose.connection.on('error', (err) => console.error('[db] connection error', err));
    mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
  }

  connecting = mongoose
    .connect(env.mongoUri, { dbName: env.mongoDbName, serverSelectionTimeoutMS: 10_000 })
    .then(() => {
      const { host, name } = mongoose.connection;
      console.log(`[db] connected to ${host}/${name}`);
    })
    .catch((err: unknown) => {
      connecting = null; // let the next request retry instead of caching the failure
      throw err;
    });

  return connecting;
}

export async function disconnectDb(): Promise<void> {
  connecting = null;
  await mongoose.disconnect();
}

export function dbState(): DbState {
  return READY_STATES[mongoose.connection.readyState] ?? 'disconnected';
}
