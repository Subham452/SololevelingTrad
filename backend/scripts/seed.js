import mongoose from 'mongoose';
import env from '../config/env.js';
if (env.NODE_ENV === 'production') { console.error('Seed refused in production'); process.exit(1); }
await mongoose.connect(env.MONGODB_URI || 'mongodb://127.0.0.1:27017', { dbName: 'sololevelingtrad' });
const { default: User } = await import('../models/User.js');
const { default: Purchase } = await import('../models/Purchase.js');
const { default: ActivityLog } = await import('../models/ActivityLog.js');
await User.deleteMany({ email: /demo\.example\.com$/ });
await Purchase.deleteMany({ orderId: `SLT-2026-DEMO01` });
await User.create({ email: 'admin.demo.example.com', firstName: 'Demo', lastName: 'Admin', role: 'superadmin', status: 'active', emailVerified: true, plan: 'MONARCH', firebaseUid: 'demo-admin-uid' });
const user = await User.create({ email: 'user.demo.example.com', firstName: 'Demo', lastName: 'Hunter', role: 'user', status: 'active', emailVerified: true, plan: 'FREE', firebaseUid: 'demo-user-uid' });
await Purchase.create({ orderId: `SLT-2026-DEMO01`, userId: user._id, plan: 'AWAKENED', amount: 999 });
await ActivityLog.create({ userId: user._id, action: 'demo_seed', meta: { demo: true } });
const { default: TradingPair } = await import('../models/TradingPair.js');
for (const p of [
  { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', coinId: 'bitcoin', minQty: 0.0001, qtyPrecision: 6, pricePrecision: 2 },
  { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', coinId: 'ethereum', minQty: 0.001, qtyPrecision: 5, pricePrecision: 2 },
  { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', coinId: 'solana', minQty: 0.01, qtyPrecision: 4, pricePrecision: 2 },
]) await TradingPair.updateOne({ symbol: p.symbol }, { $set: p }, { upsert: true });
console.log('Seeded paper-trading pairs');
console.log('Seeded demo admin + user (demo.example.com)');
await mongoose.disconnect(); process.exit(0);
