// Repeatable, safe index migration.
//
// `Model.createIndexes()` only CREATES indexes declared in the schemas; it does
// NOT drop any existing index. That makes this safe to run on production at any
// time, and safe to re-run: already-present indexes are a no-op.
//
// Usage:
//   node scripts/ensureIndexes.js
//
// Requires MONGODB_URI (from .env or the environment). No documents are read,
// modified or deleted — this script never touches user, payment or
// subscription data.
import mongoose from 'mongoose';
import env from '../config/env.js';

if (!env.MONGODB_URI) { console.error('MONGODB_URI is required'); process.exit(1); }

await mongoose.connect(env.MONGODB_URI, { dbName: 'sololevelingtrad' });

// Importing a model registers its schema (and therefore its indexes).
const modelFiles = [
  'User', 'Session', 'OTP', 'Subscription', 'Payment', 'Purchase', 'Plan',
  'CheckoutOrder', 'Order', 'Trade', 'Balance', 'LedgerTxn', 'TradingPair',
  'ActivityLog', 'AuditLog', 'LoginHistory', 'Notification', 'Usage',
  'AlgoBot', 'AlgoEvent', 'Announcement', 'ChatMessage', 'ChatSession',
  'Comms', 'Community', 'Group',
  // Real-money wallet — the UNIQUE ledger idemKey and the unique deposit
  // idempotency key are load-bearing for exactly-once credit, so they must
  // exist before any deposits are taken.
  'WalletAccount', 'WalletLedger', 'WalletDeposit', 'WhopEvent',
];

let created = 0;
for (const name of modelFiles) {
  try {
    const mod = await import(`../models/${name}.js`);
    const model = mod.default;
    if (!model?.createIndexes) continue;
    await model.createIndexes();
    created += 1;
    console.log(`indexes ensured: ${name}`);
  } catch (e) {
    console.warn(`skipped ${name}: ${e.message}`);
  }
}

console.log(`Done. Index definitions ensured for ${created} models (no data modified).`);
await mongoose.disconnect();
process.exit(0);
