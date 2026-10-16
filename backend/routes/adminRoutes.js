import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/adminController.js';
import * as cP from '../controllers/planController.js';
import * as cW from '../controllers/adminWalletController.js';
import { createPlanSchema, updatePlanSchema, planStatusSchema, reorderSchema, listPlansQuerySchema } from '../validators/planValidator.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin, requireStaff } from '../middleware/roleMiddleware.js';
import { requirePerm } from '../middleware/permissions.js';
import { adminLimiter } from '../middleware/rateLimitMiddleware.js';
import { validate } from '../validators/validationMiddleware.js';

const r = Router();
r.use(authenticate, requireStaff, adminLimiter);

// ---------------------------------------------------------------------------
// Legacy endpoints (contract preserved) — full admin gate where the original
// required it, plus permission checks on writes.
// ---------------------------------------------------------------------------
r.get('/dashboard', requireAdmin, c.dashboard); r.get('/stats', requireAdmin, c.stats);
r.get('/users', requirePerm('users:read'), c.searchUsers);
r.get('/users/:id', requirePerm('users:read'), c.userDetail);
r.patch('/users/:id', requirePerm('users:write'), c.updateUser);
r.delete('/users/:id', requirePerm('users:delete'), c.deleteUser);
r.post('/users/:id/moderate', requirePerm('users:suspend'), validate(z.object({ status: z.enum(['active', 'inactive', 'suspended', 'banned']), reason: z.string().max(500).optional() })), c.moderateUserV2);
r.post('/users/:id/role', requirePerm('roles:write'), validate(z.object({ role: z.enum(['user', 'support', 'admin', 'superadmin', 'finance', 'analyst']) })), c.setRole);
r.post('/users/:id/:action', requirePerm('users:write'), c.userAction);
r.get('/activity', requirePerm('analytics:read'), c.searchActivity);
r.get('/audit-logs', requirePerm('audit:read'), c.searchAudit);
r.get('/payments', requirePerm('finance:read'), c.searchTransactions);
r.get('/subscriptions', requirePerm('analytics:read'), c.searchSubscriptions);
r.get('/revenue', requirePerm('analytics:read'), c.revenue);
r.get('/analytics', requirePerm('analytics:read'), c.analytics);
r.post('/notifications/send', requirePerm('notifications:send'), c.sendNotification);

// ---------------------------------------------------------------------------
// Phase 13 — enterprise admin surface
// ---------------------------------------------------------------------------
// Pricing & Plans management. Write access is gated by plans:write (revenue
// configuration). Every mutation is audit-logged inside planService.
r.get('/plans', requirePerm('plans:read'), validate(listPlansQuerySchema), cP.adminListPlans);
r.get('/plans/audit', requirePerm('plans:read'), cP.adminPlanAudit);
r.post('/plans/preview', requirePerm('plans:read'), cP.adminPreviewPlans);
r.get('/plans/:id/impact', requirePerm('plans:read'), cP.adminPlanImpact);
r.post('/plans', requirePerm('plans:write'), validate(createPlanSchema), cP.adminCreatePlan);
r.patch('/plans/:id', requirePerm('plans:write'), validate(updatePlanSchema), cP.adminUpdatePlan);
r.patch('/plans/:id/status', requirePerm('plans:write'), validate(planStatusSchema), cP.adminSetPlanStatus);
r.post('/plans/reorder', requirePerm('plans:write'), validate(reorderSchema), cP.adminReorderPlans);

// Executive dashboard (KPIs, trends, comparisons) for a date range.
r.get('/overview', requirePerm('analytics:read'), c.overview);

// Transactions + real provider refunds.
r.get('/transactions', requirePerm('finance:read'), c.searchTransactions);
r.post('/payments/:id/refund', requirePerm('finance:refund'), validate(z.object({ reason: z.string().max(300).optional() })), c.refundPayment);

// Unified checkout orders: search (date/status/type/user/amount) + detail with
// provider references. Distinct from paper-trading orders.
r.get('/orders', requirePerm('finance:read'), c.searchOrders);
r.get('/orders/:id', requirePerm('finance:read'), c.orderDetail);
// Payment provider configuration status — presence/mode/warnings only, never secrets.
r.get('/payments/config', requirePerm('finance:read'), c.paymentConfig);

// ---------------------------------------------------------------------------
// Real-money wallet administration.
// Reads are finance-scoped; refunds and balance corrections are much narrower.
// There is deliberately NO endpoint that marks an arbitrary deposit as paid —
// funds only move from a verified provider webhook or provider lookup.
// ---------------------------------------------------------------------------
r.get('/wallet/overview', requirePerm('finance:read'), cW.overview);
r.get('/wallet/config', requirePerm('finance:read'), cW.providerConfig);
r.get('/wallet/deposits', requirePerm('finance:read'), cW.listDeposits);
r.get('/wallet/transactions', requirePerm('finance:read'), cW.listTransactions);
r.get('/wallet/accounts', requirePerm('finance:read'), cW.listAccounts);
r.get('/wallet/accounts/:userId/reconcile', requirePerm('finance:read'), cW.reconcileOne);
r.get('/wallet/reconciliation', requirePerm('finance:read'), cW.reconciliation);
r.get('/wallet/webhooks', requirePerm('finance:read'), cW.listWebhooks);
r.post('/wallet/deposits/:reference/refund', requirePerm('finance:wallet_refund'),
  validate(z.object({ reason: z.string().min(5).max(300) })), cW.refundDeposit);
r.post('/wallet/adjustments', requirePerm('wallet:adjust'),
  validate(z.object({
    userId: z.string().min(1),
    amountMinor: z.number().int().refine((n) => n !== 0, 'amount must be non-zero'),
    reason: z.string().min(10).max(500),
    // Credits are impossible without a verifiable provider/case reference.
    evidenceRef: z.string().min(4).max(120).optional(),
  })), cW.adjustBalance);

// Subscriptions & revenue analytics.
r.get('/subscriptions/analytics', requirePerm('analytics:read'), c.subscriptionStats);

// Security centre: login history, failed logins, active sessions, audit feed.
r.get('/security', requirePerm('security:read'), c.security);

// System health (DB, uptime, memory, counts, provider config status).
r.get('/health', c.health);

// Support messaging: admin ↔ user threads (internal notes never returned).
r.get('/messages/conversations', requirePerm('messages:read'), c.messagesConversations);
r.get('/messages/conversations/:id', requirePerm('messages:read'), c.messagesThread);
r.post('/messages/send', requirePerm('messages:send'), validate(z.object({
  conversationId: z.string().optional(),
  userId: z.string().optional(),
  content: z.string().min(1).max(4000),
})), c.messagesSend);

// Calls: list real call records + send a real VideoSDK call invitation.
r.get('/calls', requirePerm('calls:read'), c.callsList);
r.post('/calls/invite', requirePerm('calls:invite'), validate(z.object({
  userId: z.string().min(1),
  type: z.enum(['audio', 'video']).default('video'),
})), c.callsInvite);

// Live sessions & moderation.
r.get('/lives', requirePerm('moderation:read'), c.livesList);
r.post('/lives/:id/end', requirePerm('moderation:act'), validate(z.object({ reason: z.string().max(300).optional() })), c.endLiveSession);
r.get('/moderation/reports', requirePerm('moderation:read'), c.reportsList);
r.post('/moderation/reports/:id', requirePerm('moderation:act'), validate(z.object({
  status: z.enum(['reviewing', 'resolved', 'dismissed']),
  actionTaken: z.string().max(500).optional(),
})), c.reportResolve);
r.post('/moderation/messages/:id/hide', requirePerm('moderation:act'), validate(z.object({ reason: z.string().max(300).optional() })), c.hideChatMessage);

export default r;
