import mongoose from 'mongoose';
import { env } from './env.js';

export type DbState = 'disconnected' | 'connected' | 'connecting' | 'disconnecting';

const READY_STATES: Record<number, DbState> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected');
  });

  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDbName,
    serverSelectionTimeoutMS: 10_000,
  });

  const { host, name } = mongoose.connection;
  console.log(`[db] connected to ${host}/${name}`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function dbState(): DbState {
  return READY_STATES[mongoose.connection.readyState] ?? 'disconnected';
}
