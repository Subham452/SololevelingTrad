import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import AuditLog from '../models/AuditLog.js';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';
import {
  listPublishedPlans, listAllPlans, toPublicPlan, toAdminPlan,
  createPlan, updatePlan, setPlanStatus, reorderPlans, resolvePurchasablePlan, findPlan,
} from '../services/planService.js';

// ===========================================================================
// PUBLIC — pricing catalogue
// ===========================================================================

/**
 * GET /api/plans
 * Published plans only. This is what the public pricing page renders, so an
 * unpublished or archived tier is invisible and unbuyable by construction.
 */
export const publicPlans = asyncHandler(async (_req, res) => {
  const plans = await listPublishedPlans();
  return ok(res, 'OK', { plans: plans.map(toPublicPlan) });
});

/**
 * GET /api/plans/:slug
 * Single published plan (used by checkout to re-confirm before payment).
 */
export const publicPlanBySlug = asyncHandler(async (req, res) => {
  const plan = await resolvePurchasablePlan(req.params.slug);
  return ok(res, 'OK', { plan: toPublicPlan(plan) });
});

// ===========================================================================
// ADMIN — Pricing & Plans management
// ===========================================================================

/** GET /api/admin/plans?status= */
export const adminListPlans = asyncHandler(async (req, res) => {
  const plans = await listAllPlans({ status: req.query.status });
  return ok(res, 'OK', { plans: plans.map(toAdminPlan) });
});

/**
 * GET /api/admin/plans/preview
 * Renders exactly what the public pricing page would show for a draft set of
 * edits, without publishing. Accepts an optional inline draft payload so an
 * admin can preview unsaved edits; otherwise previews the live catalogue.
 */
export const adminPreviewPlans = asyncHandler(async (req, res) => {
  const draft = Array.isArray(req.body?.plans) ? req.body.plans : null;
  if (!draft) {
    const live = await listPublishedPlans();
    return ok(res, 'OK', { plans: live.map(toPublicPlan), source: 'published' });
  }
  // Map draft edits over the published catalogue for a faithful preview.
  const published = await listPublishedPlans();
  const byId = new Map(published.map((p) => [String(p._id), p]));
  const bySlug = new Map(published.map((p) => [p.slug, p]));
  const merged = draft.map((d, i) => {
    const existing = (d.id && byId.get(String(d.id))) || (d.slug && bySlug.get(String(d.slug))) || {};
    return toPublicPlan({
      ...existing,
      ...d,
      _id: existing._id || d.id || `draft-${i}`,
      priceCents: Number.isFinite(d.priceCents) ? d.priceCents : (existing.priceCents ?? 0),
      status: d.status || existing.status || 'published',
      displayOrder: Number.isFinite(d.displayOrder) ? d.displayOrder : (existing.displayOrder ?? (i + 1) * 10),
    });
  }).sort((a, b) => a.displayOrder - b.displayOrder);
  return ok(res, 'OK', { plans: merged, source: 'draft' });
});

/** POST /api/admin/plans */
export const adminCreatePlan = asyncHandler(async (req, res) => {
  const plan = await createPlan(req.user.sub, req.body);
  return ok(res, 'Plan created', { plan: toAdminPlan(plan) }, 201);
});

/** PATCH /api/admin/plans/:id */
export const adminUpdatePlan = asyncHandler(async (req, res) => {
  const plan = await updatePlan(req.user.sub, req.params.id, req.body);
  return ok(res, 'Plan updated', { plan: toAdminPlan(plan) });
});

/**
 * PATCH /api/admin/plans/:id/status  { status: draft|published|archived }
 * Publishing/unpublishing/archiving. Archiving blocks NEW purchases only —
 * existing subscribers keep their entitlements and full history.
 */
export const adminSetPlanStatus = asyncHandler(async (req, res) => {
  const plan = await setPlanStatus(req.user.sub, req.params.id, req.body.status);
  return ok(res, `Plan ${req.body.status}`, { plan: toAdminPlan(plan) });
});

/** POST /api/admin/plans/reorder  { plans: [{ id, displayOrder }] } */
export const adminReorderPlans = asyncHandler(async (req, res) => {
  const result = await reorderPlans(req.user.sub, req.body.plans);
  return ok(res, 'Order saved', result);
});

/**
 * GET /api/admin/plans/:id/impact
 * Safety check surfaced in the admin UI before an admin changes price or
 * archives a plan: how many active subscribers would be affected, and what
 * revenue those subscriptions represent. Used to warn, never to mutate.
 */
export const adminPlanImpact = asyncHandler(async (req, res) => {
  const plan = await findPlan(req.params.id);
  if (!plan) throw new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');
  const [activeSubs, totalSubs, paidPayments] = await Promise.all([
    Subscription.countDocuments({ plan: plan.slug, status: 'active' }),
    Subscription.countDocuments({ plan: plan.slug }),
    Payment.countDocuments({ plan: plan.slug, status: 'paid' }),
  ]);
  return ok(res, 'OK', {
    plan: toAdminPlan(plan),
    impact: {
      activeSubscribers: activeSubs,
      totalSubscriptions: totalSubs,
      historicalPayments: paidPayments,
      // Explicit guidance so the admin understands the blast radius.
      note: activeSubs > 0
        ? `${activeSubs} active subscriber(s) are on this plan. Editing the price affects NEW purchases only — existing subscriptions keep the price they signed up at until they renew. Archiving blocks new purchases but does not cancel existing subscriptions.`
        : 'No active subscribers on this plan — price changes and archiving carry no billing risk.',
    },
  });
});

/**
 * GET /api/admin/plans/audit
 * Pricing change history (who changed what, previous → new values).
 */
export const adminPlanAudit = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const filter = { action: { $regex: '^plan_' } };
  const [total, items] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).populate('actorId', 'email firstName lastName role')
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  return ok(res, 'OK', { items, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
});
