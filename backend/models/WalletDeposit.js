import mongoose from 'mongoose';
import { generateOrderId } from '../utils/generateId.js';

// ---------------------------------------------------------------------------
// WalletDeposit — one REAL-money deposit attempt.
//
// Lifecycle:
//   pending  -> created, funds held in WalletAccount.pendingMinor
//   paid     -> confirmed by a signature-verified Whop webhook (or an
//               authenticated server-side payments.retrieve lookup)
//   failed   -> provider reported a failure; hold released
//   expired  -> nobody completed checkout before the deadline; hold released
//   refunded -> a confirmed deposit was clawed back (a NEW reversal ledger
//               entry is written; nothing is ever deleted)
//
// The browser can never move a deposit to `paid`. The ONLY writers of the
// status transition are the webhook handler (proof = HMAC signature) and the
// authenticated verify endpoint (proof = server-to-server lookup).
//
// `reference` is the internal order reference attached to the checkout as
// metadata, which is how the webhook maps a provider payment back to this row.
// ---------------------------------------------------------------------------
const s = new mongoose.Schema({
  // Globally unique, human-facing reference shown in UI/receipts/admin.
  reference: { type: String, required: true, unique: true, index: true },
  // Client-supplied idempotency key — repeated "Add money" submits collapse
  // to a single deposit instead of double-holding funds.
  idempotencyKey: { type: String, index: true, sparse: true },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // INTEGER minor units — the browser can only ever choose a preset that the
  // server has already mapped to a Whop variant; it never supplies a price.
  amountMinor: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'amountMinor must be an integer' } },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3, default: 'USD' },

  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'expired', 'refunded'],
    default: 'pending',
    index: true,
  },

  provider: { type: String, enum: ['whop'], default: 'whop' },
  // Whop variant (checkout link) this deposit is paying for — resolved
  // server-side from the preset map, NEVER from the request body.
  providerPlanId: { type: String, default: null },
  // Confirmed provider payment id (pay_…), written only from a verified
  // webhook or an authenticated provider lookup.
  providerPaymentId: { type: String, index: true, sparse: true },

  // Ledger rows produced for this deposit (nullable until they exist).
  holdEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletLedger', default: null },
  creditEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletLedger', default: null },
  releaseEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletLedger', default: null },

  failureReason: { type: String, default: null },
  // Last provider event id we processed for this deposit (audit trail).
  lastEventId: { type: String, default: null },

  // Provider-reported amount at confirmation time (major units as Whop returns
  // them). Kept for reconciliation; a mismatch is flagged, never silently used.
  providerAmount: { type: Number, default: null },
  providerCurrency: { type: String, default: null },

  expiresAt: { type: Date, required: true, index: true },
  paidAt: { type: Date, default: null },
  settledAt: { type: Date, default: null },
}, { timestamps: true });

// Wallet history (recent first) and the admin "pending deposits" monitor.
s.index({ userId: 1, createdAt: -1 });
s.index({ status: 1, createdAt: -1 });
// One active deposit per user per idempotency key.
s.index({ userId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
// Expiry sweep: pending deposits past their deadline.
s.index({ status: 1, expiresAt: 1 });

export default mongoose.model('WalletDeposit', s);

/** Generate a deposit reference with a collision-retry loop. */
export async function nextDepositReference() {
  for (let i = 0; i < 5; i++) {
    const reference = generateOrderId('DEP');
    const clash = await mongoose.model('WalletDeposit').exists({ reference });
    if (!clash) return reference;
  }
  throw new Error('Could not allocate a unique deposit reference');
}
