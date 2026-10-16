import mongoose from 'mongoose';
import env from './env.js';
import { logger } from '../utils/logger.js';
let connected = false;
export async function connectDB(retries = 5) {
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  mongoose.set('strictQuery', true);
  for (let i = 1; i <= retries; i++) {
    try {
      await mongoose.connect(env.MONGODB_URI, { dbName: 'sololevelingtrad', serverSelectionTimeoutMS: 8000 });
      connected = true;
      logger.info('MongoDB connected: sololevelingtrad');
      return mongoose.connection;
    } catch (e) {
      logger.error(`Mongo connect attempt ${i} failed: ${e.message}`);
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}
export const dbState = () => ({ connected, state: mongoose.connection.readyState });
export function gracefulShutdown(server) {
  const shut = async (sig) => { logger.info(`${sig} received`); try { server?.close(); await mongoose.disconnect(); } finally { process.exit(0); } };
  process.on('SIGINT', () => shut('SIGINT')); process.on('SIGTERM', () => shut('SIGTERM'));
}
