import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// WalletLedger — the immutable append-only ledger for REAL money.
//
// Rows are INSERT-ONLY: nothing in the application ever updates or deletes a
// ledger entry. Corrections (refunds, reversals, admin adjustments) are written
// as NEW entries that point back at the original `reference`, so history stays
// auditable forever.
//
// Money model:
//   * `amountMinor`        — positive INTEGER magnitude of the movement
//   * `deltaAvailableMinor` / `deltaPendingMinor` — signed INTEGER effect on the
//     projection, so a row can be replayed to reproduce the balance exactly
//   * `availableAfterMinor` / `pendingAfterMinor` — the projection AFTER this
//     entry; the last row per user is the authoritative expected balance
//
// Exactly-once is enforced by `idemKey` (UNIQUE, sparse). Two concurrent
// confirmations of the same deposit cannot both insert this row: the loser gets
// E11000 and rolls back its projection update.
// ---------------------------------------------------------------------------
const s = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, default: 'USD' },

  type: {
    type: String,
    required: true,
    enum: [
      'deposit_hold',        // deposit created — moves available -> pending
      'deposit_credit',      // provider confirmed — moves pending -> available
      'deposit_expired',     // nobody paid — pending released back to available(0)
      'deposit_reversed',    // refund/dispute — a CONFIRMED deposit is clawed back
      'deposit_failed',      // provider reported failure — hold released
      'withdrawal_hold',
      'withdrawal_debit',
      'withdrawal_released',
      'adjustment',          // audited admin correction (never an overwrite)
      'fee',
      'spend',               // guarded debit (wallet balance paying for something)
      'spend_refund',
    ],
  },
  direction: { type: String, enum: ['credit', 'debit', 'neutral'], required: true },

  amountMinor: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'must be an integer minor unit' } },
  deltaAvailableMinor: { type: Number, required: true, validate: { validator: Number.isInteger, message: 'must be an integer minor unit' } },
  deltaPendingMinor: { type: Number, required: true, validate: { validator: Number.isInteger, message: 'must be an integer minor unit' } },
  availableAfterMinor: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'must be an integer minor unit' } },
  pendingAfterMinor: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'must be an integer minor unit' } },

  status: { type: String, enum: ['confirmed', 'pending', 'reversed'], default: 'confirmed' },

  // UNIQUE anti-duplication key, e.g. "whop:DEP-2026-A1B2C3:credit".
  // Declared ONLY via s.index() below so the UNIQUE + SPARSE options are
  // authoritative (declaring `sparse` here too makes Mongoose register a
  // second, plain index for the same path).
  idemKey: { type: String },

  // Human-facing reference (wallet deposit / withdrawal / adjustment id).
  reference: { type: String },
  // The row this reverses, when this is a correction.
  reversesId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletLedger' },

  provider: { type: String, enum: ['whop', 'razorpay', 'stripe', 'internal', null], default: 'internal' },
  providerPaymentId: { type: String, index: true, sparse: true },
  providerEventId: { type: String, index: true, sparse: true },

  note: { type: String, default: '' },
  // Safe audit metadata only — never secrets, tokens, OTPs or card data.
  meta: { type: mongoose.Schema.Types.Mixed },

  confirmedAt: { type: Date, default: null },
}, { timestamps: true });

// User history (most recent first), the reconciliation replay order, and the
// per-reference lookup used by the admin transaction detail.
s.index({ userId: 1, createdAt: -1 });
s.index({ userId: 1, createdAt: 1, _id: 1 });
s.index({ reference: 1 });
// Exactly-once: the same idempotency key can only ever be written once.
s.index({ idemKey: 1 }, { unique: true, sparse: true });
// Admin filtering by type/status across all users.
s.index({ type: 1, createdAt: -1 });

export default mongoose.model('WalletLedger', s);
