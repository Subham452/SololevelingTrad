import mongoose from 'mongoose';

const s = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  pair: String, side: { type: String, enum: ['buy', 'sell'] },
  type: { type: String, enum: ['market', 'limit', 'stop-loss', 'take-profit'], default: 'market' },
  qty: Number, limitPrice: Number, stopPrice: Number,
  filledQty: { type: Number, default: 0 },
  avgPrice: { type: Number, default: 0 },
  fee: { type: Number, default: 0 },
  reservedQuote: { type: Number, default: 0 },
  status: { type: String, enum: ['PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'], default: 'PENDING', index: true },
  mode: { type: String, default: 'paper' },
  clientOrderId: { type: String, sparse: true }, // idempotency
  rejectReason: String,
}, { timestamps: true });
s.index({ userId: 1, createdAt: -1 });
s.index({ userId: 1, clientOrderId: 1 }, { unique: true, sparse: true });
export default mongoose.model('Order', s);
