import mongoose from 'mongoose';
const s = new mongoose.Schema({
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'AlgoBot', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: String, message: String, meta: Object,
}, { timestamps: true });
s.index({ botId: 1, createdAt: -1 });
export default mongoose.model('AlgoEvent', s);
