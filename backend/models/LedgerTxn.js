import mongoose from 'mongoose';

// Immutable double-entry-ish ledger. Never updated, only inserted.
const s = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  asset: String, delta: Number, balanceAfter: Number,
  kind: { type: String, enum: ['seed', 'buy', 'sell', 'fee', 'reserve', 'release', 'cancel_release'] },
  refId: { type: mongoose.Schema.Types.ObjectId }, // order/trade id
  idemKey: { type: String, sparse: true },
  note: String,
}, { timestamps: true });
s.index({ userId: 1, createdAt: -1 });
s.index({ userId: 1, idemKey: 1 }, { unique: true, sparse: true });
export default mongoose.model('LedgerTxn', s);
