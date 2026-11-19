import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => console.warn('[db] MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('[db] MongoDB reconnected'));

  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`[db] Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (error) {
    console.error(`[db] Could not connect to MongoDB at ${config.mongoUri}`);
    console.error('[db] Start MongoDB or set MONGODB_URI in server/.env, then restart.');
    throw error;
  }
}

export function databaseStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] ?? 'unknown';
}
