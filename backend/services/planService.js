import Plan from '../models/Plan.js';
import AuditLog from '../models/AuditLog.js';
import { AppError } from '../utils/AppError.js';

// ---------------------------------------------------------------------------
// Public pricing catalogue cache.
//
// The published catalogue is read on nearly every visit to the pricing page
// and during checkout review, but changes only when an admin edits a plan. It
// is cached for at most PRICING_TTL_MS and explicitly invalidated by every
// admin write below, so a price change is visible immediately on this instance
// and within the TTL across instances.
//
// This cache NEVER feeds checkout: order pricing resolves the authoritative
// Plan document fresh via resolvePurchasablePlan(), so a stale list can never
// change what a customer is actually charged.
// ---------------------------------------------------------------------------
const PRICING_TTL_MS = 15_000;
let publishedCache = { at: 0, data: null };
export function invalidatePublishedPlansCache() { publishedCache = { at: 0, data: null }; }

// ---------------------------------------------------------------------------
// Plan catalogue service.
//
// This is the single source of truth for pricing. Nothing in the app may hard
// code a plan name or price: checkout, entitlements, analytics and the public
// pricing page all resolve through here.
//
// Legacy note: backend/config/plans.js still exists for historical plan ids
// (HUNTER/AWAKENED/MONARCH) that existing subscribers already hold. New
// purchases only ever resolve to a *published* Plan document.
// ---------------------------------------------------------------------------

// The five launch tiers. Amounts are integer cents (USD).
export const DEFAULT_PLANS = [
  {
    name: 'Starter', slug: 'starter', priceCents: 2000, displayOrder: 10,
    blurb: 'Get your edge with real-time market intelligence.',
    description: 'Everything a developing trader needs to follow the market with confidence.',
    features: ['Live market data (delayed tier)', '10 symbol watchlist', 'Basic AI insights (100/mo)', '3 price alerts', 'Community access'],
    limits: { aiLimit: 100, watchlists: 10, alerts: 3 },
    cta: 'Start with Starter',
  },
  {
    name: 'Basic', slug: 'basic', priceCents: 3000, displayOrder: 20,
    blurb: 'Real signals and deeper coverage for active traders.',
    description: 'Step up to full real-time data, more alerts and a serious AI allowance.',
    features: ['Real-time market data', '50 symbol watchlist', 'AI insights (500/mo)', '15 price alerts', 'Portfolio tracking', 'Community access'],
    limits: { aiLimit: 500, watchlists: 50, alerts: 15 },
    cta: 'Choose Basic',
  },
  {
    name: 'Pro', slug: 'pro', priceCents: 5000, displayOrder: 30, recommended: true, badge: 'Most popular',
    blurb: 'The full terminal for traders who act on the data.',
    description: 'Unlimited alerts, advanced analytics and the complete terminal workspace.',
    features: ['Everything in Basic', 'Unlimited watchlists', 'AI insights (2,500/mo)', 'Unlimited alerts', 'Advanced charting & indicators', 'Algo strategy backtesting', 'Priority support'],
    limits: { aiLimit: 2500, watchlists: -1, alerts: -1 },
    cta: 'Go Pro',
  },
  {
    name: 'Elite', slug: 'elite', priceCents: 10000, displayOrder: 40,
    blurb: 'Desk-grade tooling with deeper analytics and API access.',
    description: 'For professional desks that need automation, API access and priority throughput.',
    features: ['Everything in Pro', 'AI insights (10,000/mo)', 'REST API access', 'Algo & automation tools', 'Risk analytics suite', 'Dedicated account manager'],
    limits: { aiLimit: 10000, watchlists: -1, alerts: -1 },
    cta: 'Choose Elite',
  },
  {
    name: 'Ultimate', slug: 'ultimate', priceCents: 15000, displayOrder: 50,
    blurb: 'Everything, unmetered, with white-glove onboarding.',
    description: 'The complete platform with no artificial ceilings and hands-on setup.',
    features: ['Everything in Elite', 'Unlimited AI insights', 'White-glove onboarding', 'Custom integrations', 'SLA-backed support', 'Team seats included'],
    limits: { aiLimit: -1, watchlists: -1, alerts: -1 },
    cta: 'Choose Ultimate',
  },
];

/** Public/admin projection — never leaks internal ids or provenance fields. */
export function toPublicPlan(p) {
  if (!p) return null;
  return {
    id: String(p._id),
    slug: p.slug,
    name: p.name,
    blurb: p.blurb || '',
    description: p.description || '',
    priceCents: p.priceCents,
    // Derived display strings — the UI never does its own money math.
    price: (p.priceCents / 100).toFixed(p.priceCents % 100 === 0 ? 0 : 2),
    currency: p.currency || 'USD',
    interval: p.interval || 'month',
    intervalCount: p.intervalCount || 1,
    features: p.features || [],
    limits: p.limits || {},
    badge: p.badge || '',
    recommended: !!p.recommended,
    cta: p.cta || 'Choose plan',
    status: p.status,
    displayOrder: p.displayOrder ?? 0,
    // Only surfaced to admins; harmless but not needed publicly.
    providerPriceIds: undefined,
  };
}

/** Full admin projection (includes provenance + provider ids). */
export function toAdminPlan(p) {
  if (!p) return null;
  return {
    ...toPublicPlan(p),
    providerPriceIds: {
      razorpay: p.providerPriceIds?.razorpay || null,
      stripe: p.providerPriceIds?.stripe || null,
    },
    createdBy: p.createdBy ? { id: String(p.createdBy._id || p.createdBy), email: p.createdBy.email || null } : null,
    updatedBy: p.updatedBy ? { id: String(p.updatedBy._id || p.updatedBy), email: p.updatedBy.email || null } : null,
    publishedAt: p.publishedAt || null,
    archivedAt: p.archivedAt || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Published catalogue for the public pricing page, ordered for display. */
export async function listPublishedPlans() {
  const now = Date.now();
  if (publishedCache.data && now - publishedCache.at < PRICING_TTL_MS) return publishedCache.data;
  const data = await Plan.find({ status: 'published' }).sort({ displayOrder: 1, createdAt: 1 }).lean();
  publishedCache = { at: now, data };
  return data;
}

/** Every plan for the admin manager, optionally filtered by status. */
export async function listAllPlans({ status } = {}) {
  const filter = status ? { status } : {};
  return Plan.find(filter).sort({ displayOrder: 1, createdAt: 1 }).lean();
}

/**
 * Resolve a plan for PURCHASE. Throws unless the plan exists and is published.
 * Archived/draft plans must never be bought — this is the enforcement point
 * for "invalid, unpublished or archived plans cannot be purchased".
 */
export async function resolvePurchasablePlan(slugOrId) {
  const key = String(slugOrId || '').trim();
  if (!key) throw new AppError('Plan is required', 400, 'PLAN_REQUIRED');
  const q = /^[a-f0-9]{24}$/i.test(key) ? { _id: key } : { slug: key.toLowerCase() };
  const plan = await Plan.findOne(q).lean();
  if (!plan) throw new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');
  if (plan.status === 'archived') throw new AppError('This plan is no longer available for new purchases', 409, 'PLAN_ARCHIVED');
  if (plan.status !== 'published') throw new AppError('This plan is not available for purchase', 409, 'PLAN_UNPUBLISHED');
  return plan;
}

/** Look up a plan by slug or id without status gating (for entitlements). */
export async function findPlan(slugOrId) {
  const key = String(slugOrId || '').trim();
  if (!key) return null;
  const q = /^[a-f0-9]{24}$/i.test(key) ? { _id: key } : { slug: key.toLowerCase() };
  return Plan.findOne(q).lean();
}

// ---------------------------------------------------------------------------
// Writes (admin only — callers must already be authorization-checked)
// ---------------------------------------------------------------------------

async function audit(actorId, action, target, meta) {
  try {
    await AuditLog.create({ actorId, action, target: String(target), meta });
  } catch { /* audit must never break the primary operation */ }
}

/** Only these fields may be set from an admin request (mass-assignment guard). */
const WRITABLE = [
  'name', 'slug', 'blurb', 'description', 'priceCents', 'currency', 'interval',
  'intervalCount', 'features', 'limits', 'badge', 'recommended', 'cta',
  'status', 'displayOrder', 'providerPriceIds',
];

function pickWritable(patch = {}) {
  const out = {};
  for (const k of WRITABLE) if (patch[k] !== undefined) out[k] = patch[k];
  // Nested objects need explicit handling so callers can't smuggle extra keys.
  if (patch.limits !== undefined) {
    const l = patch.limits || {};
    out.limits = {
      aiLimit: Number.isFinite(l.aiLimit) ? l.aiLimit : undefined,
      watchlists: Number.isFinite(l.watchlists) ? l.watchlists : undefined,
      alerts: Number.isFinite(l.alerts) ? l.alerts : undefined,
    };
  }
  if (patch.providerPriceIds !== undefined) {
    const pp = patch.providerPriceIds || {};
    out.providerPriceIds = { razorpay: pp.razorpay || null, stripe: pp.stripe || null };
  }
  return out;
}

/** Diff helper so the audit log records previous → new values. */
function diff(before, after) {
  const changes = {};
  for (const k of Object.keys(after)) {
    const a = JSON.stringify(before?.[k]);
    const b = JSON.stringify(after[k]);
    if (a !== b) changes[k] = { from: before?.[k], to: after[k] };
  }
  return changes;
}

export async function createPlan(actorId, input) {
  const doc = pickWritable(input);
  if (await Plan.exists({ slug: doc.slug })) throw new AppError(`A plan with slug '${doc.slug}' already exists`, 409, 'SLUG_TAKEN');
  // Guarantee a single recommended plan at any time.
  if (doc.recommended) await Plan.updateMany({ recommended: true }, { $set: { recommended: false } });
  const plan = await Plan.create({ ...doc, createdBy: actorId, updatedBy: actorId });
  invalidatePublishedPlansCache();
  await audit(actorId, 'plan_create', plan._id, { slug: plan.slug, name: plan.name, priceCents: plan.priceCents, status: plan.status });
  return plan;
}

export async function updatePlan(actorId, id, patch) {
  const plan = await Plan.findById(id);
  if (!plan) throw new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');
  const doc = pickWritable(patch);

  // Slug changes are risky (checkout + entitlements reference it) — guard them.
  if (doc.slug && doc.slug !== plan.slug) {
    if (await Plan.exists({ slug: doc.slug, _id: { $ne: plan._id } })) {
      throw new AppError(`A plan with slug '${doc.slug}' already exists`, 409, 'SLUG_TAKEN');
    }
  }
  if (doc.recommended === true) await Plan.updateMany({ recommended: true, _id: { $ne: plan._id } }, { $set: { recommended: false } });

  // Status transitions carry timestamps used by the audit UI.
  if (doc.status && doc.status !== plan.status) {
    if (doc.status === 'published') doc.publishedAt = new Date();
    if (doc.status === 'archived') doc.archivedAt = new Date();
  }

  const before = plan.toObject();
  for (const [k, v] of Object.entries(doc)) plan[k] = v;
  plan.updatedBy = actorId;
  await plan.save();
  invalidatePublishedPlansCache();

  await audit(actorId, 'plan_update', plan._id, { slug: plan.slug, changes: diff(before, plan.toObject()) });
  return plan;
}

export async function setPlanStatus(actorId, id, status) {
  const plan = await Plan.findById(id);
  if (!plan) throw new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');
  const before = plan.status;
  plan.status = status;
  if (status === 'published') plan.publishedAt = new Date();
  if (status === 'archived') plan.archivedAt = new Date();
  plan.updatedBy = actorId;
  await plan.save();
  invalidatePublishedPlansCache();
  await audit(actorId, `plan_${status}`, plan._id, { slug: plan.slug, from: before, to: status });
  return plan;
}

/** Reorder plans. Accepts [{ id, displayOrder }] or a flat id array. */
export async function reorderPlans(actorId, entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) throw new AppError('No ordering supplied', 400, 'EMPTY_ORDER');
  const ops = list.map((e, i) => ({
    updateOne: { filter: { _id: e.id }, update: { $set: { displayOrder: Number.isFinite(e.displayOrder) ? e.displayOrder : (i + 1) * 10, updatedBy: actorId } } },
  }));
  const result = await Plan.bulkWrite(ops);
  invalidatePublishedPlansCache();
  await audit(actorId, 'plan_reorder', 'catalogue', { count: result.modifiedCount });
  return { updated: result.modifiedCount };
}

/**
 * Idempotent seeding. Creates the five launch tiers ONLY if their slug does
 * not exist yet, so re-running (including on every server boot) never
 * duplicates plans and never clobbers an admin's live edits.
 * Returns { created, skipped }.
 */
export async function ensureSeedPlans({ actorId = null } = {}) {
  let created = 0;
  let skipped = 0;
  for (const p of DEFAULT_PLANS) {
    const exists = await Plan.exists({ slug: p.slug });
    if (exists) { skipped += 1; continue; }
    await Plan.create({
      ...p,
      currency: 'USD',
      interval: 'month',
      status: 'published',
      providerPriceIds: { razorpay: null, stripe: null },
      createdBy: actorId,
      updatedBy: actorId,
      publishedAt: new Date(),
    });
    created += 1;
  }
  if (created) await audit(actorId, 'plan_seed', 'catalogue', { created, skipped });
  if (created) invalidatePublishedPlansCache();
  return { created, skipped };
}
