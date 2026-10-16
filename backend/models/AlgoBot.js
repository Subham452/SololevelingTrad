import mongoose from 'mongoose';

const s = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  name: String,
  strategy: { type: String, enum: ['sma-crossover', 'rsi-reversion'], required: true },
  pair: String, coinId: String,
  mode: { type: String, enum: ['paper'], default: 'paper' },
  capitalAlloc: { type: Number, default: 1000 },
  maxOrderSize: { type: Number, default: 500 },
  maxDailyLoss: { type: Number, default: 100 },
  stopLossPct: { type: Number, default: 2 },
  takeProfitPct: { type: Number, default: 4 },
  fastPeriod: { type: Number, default: 9 },
  slowPeriod: { type: Number, default: 21 },
  status: { type: String, enum: ['idle', 'running', 'paused', 'stopped', 'error'], default: 'idle' },
  lastRunAt: Date, lastError: String,
  positions: [{ pair: String, qty: Number, entry: Number, openedAt: Date }],
  realizedPnl: { type: Number, default: 0 },
}, { timestamps: true });
s.index({ userId: 1, status: 1 });
export default mongoose.model('AlgoBot', s);
