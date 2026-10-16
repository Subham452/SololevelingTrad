import mongoose from 'mongoose';

// One row per (user, asset). Paper-trading balances only — never real money.
const s = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  asset: { type: String, index: true }, // BTC, ETH, USDT
  available: { type: Number, default: 0 },
  reserved: { type: Number, default: 0 },
}, { timestamps: true });
s.index({ userId: 1, asset: 1 }, { unique: true });
export default mongoose.model('Balance', s);
