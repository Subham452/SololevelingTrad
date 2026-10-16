import Payment from '../models/Payment.js';
import Purchase from '../models/Purchase.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { paginate } from '../utils/sanitize.js';
import { verifyRazorpaySignature, resolveCheckoutPlan, createProviderOrder, paymentProvider } from '../services/paymentService.js';
import { generateOrderId } from '../utils/generateId.js';
import { sendPaymentEmail } from '../services/emailService.js';

/**
 * Grant paid access, exactly once, after a payment is provider-confirmed.
 *
 * Two owners are possible and they never both run for the same payment:
 *   * a unified-checkout Payment (pay.checkoutOrderId set) → the CheckoutOrder
 *     owns fulfilment (plan activation, or a simulated crypto credit). We skip
 *     the legacy path so a crypto symbol is never mistaken for a plan id and a
 *     subscription is never activated twice.
 *   * a legacy Payment (no checkoutOrderId) → activate the plan directly.
 */
async function grantAccess(pay, providerPaymentId) {
  if (pay.checkoutOrderId) {
    const { settleCheckoutOrder } = await import('../services/checkoutService.js');
    await settleCheckoutOrder({ providerOrderId: pay.providerOrderId, payment: pay, providerPaymentId });
    return;
  }
  if (pay.plan && pay.plan !== 'FREE') {
    const { activateSubscription } = await import('../services/subscriptionService.js');
    const sub = await activateSubscription(pay.userId, pay.plan, pay._id);
    await User.findByIdAndUpdate(pay.userId, { plan: pay.plan, currentSubscription: sub._id, subscriptionStatus: 'active', subscriptionExpiresAt: sub.expiresAt });
  }
}
export const create = asyncHandler(async (req, res) => {
  const { plan } = req.body;
  // Server-side price resolution: reads the published Plan document (or the
  // legacy config fallback). A client-submitted price is never trusted.
  // Resolve the plan ONCE and reuse it — the previous code resolved it twice
  // (here and inside createOrder), doubling the catalogue lookups per request.
  const resolved = await resolveCheckoutPlan(plan);
  const o = await createProviderOrder({
    amountCents: resolved.priceCents,
    currency: resolved.currency || 'USD',
    notes: { plan: resolved.id, userId: String(req.user.sub) },
  });
  const pay = await Payment.create({
    userId: req.user.sub, provider: o.provider, providerOrderId: o.orderId,
    amount: o.amount, amountCents: o.amountCents, currency: o.currency,
    plan: resolved.id, status: 'created',
  });
  return ok(res, 'Order created', { payment: pay, gateway: o, plan: { name: resolved.name, slug: resolved.slug, priceCents: resolved.priceCents, currency: resolved.currency } }, 201);
});
export const verify = asyncHandler(async (req, res) => {
  const { orderId, razorpay_payment_id, razorpay_signature } = req.body;
  const pay = await Payment.findOne({ $or: [{ providerOrderId: orderId }, { _id: /^[a-f0-9]{24}$/i.test(orderId || '') ? orderId : null }] });
  if (!pay) return res.status(404).json({ success: false, message: 'Payment not found' });
  // Ownership: a user can only verify their own payment orders.
  if (String(pay.userId) !== String(req.user.sub)) return res.status(403).json({ success: false, message: 'Forbidden' });
  if (pay.status === 'paid') return ok(res, 'Already verified', { payment: pay });

  // PROOF OF PAYMENT — per provider, and never whatever the browser claims.
  if (pay.provider === 'razorpay') {
    // The provider's HMAC signature over orderId|paymentId is the only thing
    // that proves this payment happened. Omitting it gets a400, not a grant.
    if (!razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment signature' });
    }
    if (!verifyRazorpaySignature(pay.providerOrderId, razorpay_payment_id, razorpay_signature)) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    pay.providerPaymentId = razorpay_payment_id;
  } else if (pay.provider === 'stripe') {
    // Hosted checkout hands no signature back to the browser, so ask Stripe.
    const { confirmStripePayment } = await import('../services/paymentService.js');
    const r = await confirmStripePayment(pay.providerOrderId);
    if (!r.confirmed) {
      // Not an error: the charge may still be settling or the webhook may not
      // have arrived. Report "pending" so the UI polls instead of guessing.
      return ok(res, 'Payment not confirmed yet', { payment: pay, confirmed: false });
    }
    if (r.paymentIntentId) pay.providerPaymentId = r.paymentIntentId;
  } else {
    return res.status(400).json({ success: false, message: 'Unsupported payment provider' });
  }

  pay.status = 'paid'; await pay.save();
  // Idempotent: a second verify (or a racing webhook) must not double-create
  // the purchase record or double-increment lifetime spend.
  const existingPurchase = await Purchase.findOne({ paymentId: pay._id });
  if (!existingPurchase) {
    await Purchase.create({ orderId: generateOrderId(), userId: pay.userId, plan: pay.plan, amount: pay.amount, currency: pay.currency, paymentId: pay._id });
    await User.findByIdAndUpdate(pay.userId, { $inc: { totalSpent: pay.amount } });
  }
  // Activate entitlement server-side against the verified payment.
  await grantAccess(pay, razorpay_payment_id || pay.providerPaymentId);
  const u = await User.findById(pay.userId);
  if (u) await sendPaymentEmail(u.email, pay.providerOrderId, pay.amount, pay.currency).catch(() => {});
  return ok(res, 'Payment verified', { payment: pay });
});
export const history = asyncHandler(async (req, res) => { const { page, limit, skip } = paginate(req.query); const [items, total] = await Promise.all([Payment.find({ userId: req.user.sub }).sort({ createdAt: -1 }).skip(skip).limit(limit), Payment.countDocuments({ userId: req.user.sub })]); return ok(res, 'OK', { items, page, limit, total }); });
export const byId = asyncHandler(async (req, res) => { const p = await Payment.findOne({ _id: req.params.id, userId: req.user.sub }); if (!p) return res.status(404).json({ success: false, message: 'Not found' }); return ok(res, 'OK', { payment: p }); });
export const webhook = asyncHandler(async (req, res) => {
  const raw = req.body; const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw));
  const provider = req.query.provider || paymentProvider();
  let eventId = null; let ent = null; let eventType = ''; let candidates = [];
  if (provider === 'stripe') {
    const { verifyStripeWebhook } = await import('../services/paymentService.js');
    // constructEvent verifies the signature against the RAW body and throws on
    // a mismatch, so a forged or altered body never reaches the logic below.
    const evt = verifyStripeWebhook(buf, req.headers['stripe-signature']);
    eventId = evt.id;
    eventType = String(evt.type || '');
    // Event-level idempotency: the same provider event is only ever applied once.
    if (await Payment.findOne({ webhookEventId: eventId })) return ok(res, 'Already processed');
    ent = evt.data?.object || null;
    // A hosted Checkout Session body carries the session id; a PaymentIntent
    // body carries the intent id. Our Payment row is keyed on whichever id was
    // used at creation, so match on any identifier this body could carry.
    candidates = [ent?.id, ent?.payment_intent, ent?.metadata?.checkoutReference].filter(Boolean);
  } else {
    const { verifyRazorpayWebhook } = await import('../services/paymentService.js');
    const evt = verifyRazorpayWebhook(buf, req.headers['x-razorpay-signature']);
    eventId = evt.event + ':' + (evt.payload?.payment?.entity?.id || Date.now());
    eventType = String(evt.event || '');
    if (await Payment.findOne({ webhookEventId: eventId })) return ok(res, 'Already processed');
    ent = evt.payload?.payment?.entity || {};
    candidates = [ent?.order_id, ent?.payment_intent, ent?.id].filter(Boolean);
  }

  // Event-type gating. A provider sends failure and expiry events over the
  // same endpoint as successes — none of those may ever grant access. Events
  // we do not act on are still acknowledged with 200 so the provider stops
  // retrying them.
  const isSuccess = provider === 'stripe'
    ? ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded'].includes(eventType)
    : eventType !== 'payment.failed';
  const isFailure = provider === 'stripe'
    ? ['checkout.session.expired', 'checkout.session.async_payment_failed', 'payment_intent.payment_failed'].includes(eventType)
    : eventType === 'payment.failed';
  if (!isSuccess && !isFailure) return ok(res, 'Event ignored');

  const pay = candidates.length ? await Payment.findOne({ providerOrderId: { $in: candidates } }) : null;
  if (!pay) return ok(res, 'Webhook received (no matching local payment)');

  // A reported failure: record it and stop the result page polling, but never
  // grant entitlement.
  if (isFailure) {
    if (pay.status !== 'paid') {
      pay.status = 'failed';
      pay.webhookEventId = eventId;
      await pay.save();
      if (pay.checkoutOrderId) {
        const { default: CheckoutOrder } = await import('../models/CheckoutOrder.js');
        await CheckoutOrder.updateOne(
          { _id: pay.checkoutOrderId, status: { $ne: 'paid' } },
          { $set: { status: 'failed', failureReason: 'The payment provider reported this payment as unsuccessful.' } },
        );
      }
    }
    return ok(res, 'Failure recorded');
  }

  // The provider's own payment reference: Stripe reports it as payment_intent
  // (its ent.id is the session id for hosted checkout events); Razorpay
  // reports it as the payment entity id.
  const providerPaymentId = provider === 'stripe' ? (ent?.payment_intent || ent?.id) : ent?.id;

  // IDEMPOTENT ACTIVATION: if this payment is already paid, do not create a
  // second Purchase or re-activate the subscription. A duplicate webhook (or a
  // webhook racing the /payments/verify endpoint) is therefore a no-op.
  const alreadyPaid = pay.status === 'paid';
  if (!alreadyPaid) {
    pay.status = 'paid';
    if (providerPaymentId) pay.providerPaymentId = providerPaymentId;
  }
  pay.webhookEventId = eventId;
  await pay.save();

  if (!alreadyPaid) {
    // Guard Purchase creation against a concurrent verify call too.
    const existing = await Purchase.findOne({ paymentId: pay._id });
    if (!existing) {
      await Purchase.create({ orderId: generateOrderId(), userId: pay.userId, plan: pay.plan, amount: pay.amount, currency: pay.currency, paymentId: pay._id });
      await User.findByIdAndUpdate(pay.userId, { $inc: { totalSpent: pay.amount } });
    }
    // Grant entitlement only after provider-confirmed payment.
    await grantAccess(pay, providerPaymentId || pay.providerPaymentId);
    const u = await User.findById(pay.userId);
    if (u) await sendPaymentEmail(u.email, pay.providerOrderId, pay.amount, pay.currency).catch(() => {});
  }
  return ok(res, alreadyPaid ? 'Already processed' : 'Webhook received');
});
