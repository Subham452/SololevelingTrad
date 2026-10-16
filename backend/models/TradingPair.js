import mongoose from 'mongoose';

// Static paper-trading venues. Only these pairs are tradeable.
const s = new mongoose.Schema({
  symbol: { type: String, unique: true, index: true }, // e.g. BTC/USDT
  base: String, quote: String, coinId: String, // coinId = CoinGecko id for pricing
  minQty: { type: Number, default: 0.0001 },
  qtyPrecision: { type: Number, default: 6 },
  pricePrecision: { type: Number, default: 2 },
  feeRate: { type: Number, default: 0.001 }, // 0.1%
  active: { type: Boolean, default: true },
}, { timestamps: true });
export default mongoose.model('TradingPair', s);
