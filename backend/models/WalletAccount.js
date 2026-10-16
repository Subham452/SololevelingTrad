import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// WalletAccount — the stored balance PROJECTION for REAL money.
//
// This is deliberately a different collection from models/Balance.js, which is
// the paper-trading simulation (`asset` balances like USDT). Real funds and
// simulated funds must never touch the same row.
//
// Every field is an INTEGER minor-unit amount (cents). No floating point is
// ever used to represent money here, and this document is ONLY ever mutated by
// `$inc` inside walletService — never by a read-modify-write in JS.
//
//   availableMinor  — spendable right now
//   pendingMinor    — funds held by a deposit that has not been confirmed yet
//                     (NOT spendable — a redirect or a browser claim can never
//                     move money in here; only a verified provider webhook can)
//
// Invariant (checked by walletService.reconcileAccount):
//     availableAfterMinor  of the newest ledger entry  ===  availableMinor
//     pendingAfterMinor    of the newest ledger entry  ===  pendingMinor
// ---------------------------------------------------------------------------
const s = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, default: 'USD' },

  availableMinor: { type: Number, default: 0, min: 0, validate: { validator: Number.isInteger, message: 'must be an integer minor unit' } },
  pendingMinor: { type: Number, default: 0, min: 0, validate: { validator: Number.isInteger, message: 'must be an integer minor unit' } },

  // Lifetime counters (monotonic, never decrease) for reporting/reconciliation.
  lifetimeDepositsMinor: { type: Number, default: 0, min: 0 },
  lifetimeWithdrawalsMinor: { type: Number, default: 0, min: 0 },

  // Last time the projection disagreed with the replayed ledger (null = healthy).
  discrepancyAt: { type: Date, default: null },
  discrepancyNote: { type: String, default: null },
}, { timestamps: true });

// One projection per user per currency; also the upsert target for $inc.
s.index({ userId: 1, currency: 1 }, { unique: true });
// Admin list of accounts by currency with a healthy/default state.
s.index({ currency: 1, updatedAt: -1 });

export default mongoose.model('WalletAccount', s);
