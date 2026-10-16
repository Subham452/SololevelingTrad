import Subscription from '../models/Subscription.js';
import { getPlan } from '../config/plans.js';
import { findPlan, listPublishedPlans } from './planService.js';

// Resolves a plan for entitlement/activation purposes. New pricing tiers live
// in the Plan collection; legacy ids (HUNTER/AWAKENED/MONARCH) still resolve
// through the historical config so existing subscribers keep working.
export async function resolvePlanForEntitlement(planRef) {
  const key = String(planRef || '').trim();
  if (!key) return null;
  const db = await findPlan(key);
  if (db) return { id: db.slug, name: db.name, slug: db.slug, priceCents: db.priceCents, currency: db.currency || 'USD', limits: db.limits };
  try {
    const legacy = getPlan(key);
    return { id: legacy.id, name: legacy.name, slug: String(legacy.id).toLowerCase(), priceCents: Math.round((legacy.priceINR || 0) * 100), currency: 'INR', limits: { aiLimit: legacy.aiLimit } };
  } catch { return null; }
}

export async function activateSubscription(userId, planId, paymentId = null, days = 30) {
  const resolved = await resolvePlanForEntitlement(planId);
  if (!resolved) throw Object.assign(new Error('Invalid plan'), { statusCode: 400 });
  await Subscription.updateMany({ userId, status: 'active' }, { $set: { status: 'cancelled' } });
  const sub = await Subscription.create({ userId, plan: resolved.slug, status: 'active', expiresAt: new Date(Date.now() + days * 864e5), paymentId });
  return sub;
}
export async function cancelSubscription(userId) { return Subscription.findOneAndUpdate({ userId, status: 'active' }, { status: 'cancelled' }, { new: true }); }
export async function expireDueSubscriptions() { return Subscription.updateMany({ status: 'active', expiresAt: { $lt: new Date() } }, { $set: { status: 'expired' } }); }
/**
 * The authoritative active subscription for a user. Expiry is enforced here as
 * well as by the hourly expire job, so a lapsed subscription stops granting
 * entitlement at its expiry instant rather than up to an hour later. Records
 * with no expiry are treated as active (legacy rows only).
 */
export async function currentSubscription(userId) {
  const now = new Date();
  return Subscription.findOne({
    userId,
    status: 'active',
    $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
  }).sort({ createdAt: -1 });
}

/** Published catalogue for the in-app subscription page. */
export async function listPurchasablePlans() {
  const plans = await listPublishedPlans();
  return plans.map((p) => ({
    id: p.slug, slug: p.slug, name: p.name, priceCents: p.priceCents,
    price: (p.priceCents / 100).toFixed(p.priceCents % 100 === 0 ? 0 : 2),
    currency: p.currency || 'USD', interval: p.interval || 'month',
    features: p.features || [], recommended: !!p.recommended, badge: p.badge || '',
    blurb: p.blurb || '',
  }));
}
