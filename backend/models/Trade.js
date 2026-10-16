import mongoose from 'mongoose';

// Immutable fill records (auditable).
const s = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
  pair: String, side: String, qty: Number, price: Number, fee: Number,
  mode: { type: String, default: 'paper' },
}, { timestamps: true });
s.index({ userId: 1, createdAt: -1 });
export default mongoose.model('Trade', s);
