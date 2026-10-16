import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// WhopEvent — provider event journal.
//
// Whop delivers every webhook at-least-once, with retries sharing the SAME
// `webhook-id`, and delivery order is NOT guaranteed. `eventId` is UNIQUE, so
// a redelivery is rejected at the database level before any money logic runs —
// this is the second line of defence behind the status-transition claim on
// WalletDeposit.
//
// The row is written FIRST (status 'received'), then the business logic runs,
// then the row is updated to 'processed'/'failed'. A row stuck at 'received'
// or 'failed' is visible to admins as a webhook that needs attention.
// ---------------------------------------------------------------------------
const s = new mongoose.Schema({
  provider: { type: String, enum: ['whop', 'razorpay', 'stripe'], required: true, default: 'whop' },
  // Standard Webhooks `webhook-id` header (msg_…) — unique per delivery.
  eventId: { type: String, required: true, unique: true, index: true },
  type: { type: String, default: '', index: true },

  status: {
    type: String,
    enum: ['received', 'processed', 'failed', 'ignored', 'unmatched'],
    default: 'received',
    index: true,
  },
  error: { type: String, default: null },

  // What the event was about — enough to reconcile without storing card data.
  providerPaymentId: { type: String, default: null, index: true, sparse: true },
  depositReference: { type: String, default: null, index: true, sparse: true },

  // Redacted payload excerpt for the admin "webhook processing status" view.
  // Never store signatures, secrets or card numbers here.
  summary: { type: mongoose.Schema.Types.Mixed, default: null },

  processedAt: { type: Date, default: null },
  // Cheap defence against a pathological retry loop.
  attempts: { type: Number, default: 1 },
}, { timestamps: true });

s.index({ createdAt: -1 });
s.index({ provider: 1, status: 1, createdAt: -1 });

export default mongoose.model('WhopEvent', s);
