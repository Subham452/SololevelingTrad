import AppError from '../utils/AppError.js';
import { ok } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { paginate } from '../utils/sanitize.js';
import WalletAccount from '../models/WalletAccount.js';
import WalletLedger from '../models/WalletLedger.js';
import WalletDeposit from '../models/WalletDeposit.js';
import WhopEvent from '../models/WhopEvent.js';
import User from '../models/User.js';
import {
  reconcileMany, reconcileAccount, reverseDeposit, adminAdjust, getDeposit,
} from '../services/walletService.js';
import { refundDepositPayment, whopProviderStatus, depositPresets, whopConfigured } from '../services/whopService.js';

// ---------------------------------------------------------------------------
// Admin wallet & payment management.
//
// Every handler here sits behind (authenticate + requireStaff + adminLimiter)
// from adminRoutes and additionally declares a requirePerm() permission, so a
// frontend comparison can never grant access. There is deliberately NO endpoint
// that marks an arbitrary deposit as paid: money only ever moves from a
// verified provider webhook or an authenticated provider lookup.
// ---------------------------------------------------------------------------

const CURRENCY = 'usd';

/** GET /api/admin/wallet/overview — deposits, ledger and alert summary. */
export const overview = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 30 * 864e5);
  const [pending, pendingTotal, paidAgg, failed, refunded, accountCount, recon, webhookFailures, webhookUnmatched, aged] = await Promise.all([
    WalletDeposit.countDocuments({ status: 'pending' }),
    WalletDeposit.aggregate([{ $match: { status: 'pending' } }, { $group: { _id: null, total: { $sum: '$amountMinor' }, count: { $sum: 1 } } }]),
    WalletDeposit.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amountMinor' }, count: { $sum: 1 } } }]),
    WalletDeposit.countDocuments({ status: 'failed' }),
    WalletDeposit.countDocuments({ status: 'refunded' }),
    WalletAccount.countDocuments({}),
    reconcileMany({ limit: 200 }),
    WhopEvent.countDocuments({ status: 'failed' }),
    WhopEvent.countDocuments({ status: 'unmatched' }),
    // A pending deposit older than 15 minutes is worth watching.
    WalletDeposit.countDocuments({ status: 'pending', createdAt: { $lt: new Date(Date.now() - 15 * 60e3) } }),
  ]);

  return ok(res, 'Wallet overview', {
    provider: whopProviderStatus(),
    presets: depositPresets().map((p) => ({ amountMinor: p.amountMinor, amount: p.amount })),
    deposits: {
      pendingCount: pending,
      pendingMinor: pendingTotal[0]?.total || 0,
      totalPaidCount: paidAgg[0]?.count || 0,
      totalPaidMinor: paidAgg[0]?.total || 0,
      failedCount: failed,
      refundedCount: refunded,
      agedPendingCount: aged,
    },
    accounts: accountCount,
    reconciliation: recon,
    webhooks: { failed: webhookFailures, unmatched: webhookUnmatched },
    // Suspicious-activity style signals (conservative, no auto-action).
    alerts: [
      ...(recon.mismatches.length ? [`${recon.mismatches.length} account(s) disagree with their ledger`] : []),
      ...(webhookFailures ? [`${webhookFailures} webhook delivery(ies) failed to process`] : []),
      ...(webhookUnmatched ? [`${webhookUnmatched} webhook event(s) unmatched to a local record`] : []),
      ...(aged ? [`${aged} deposit(s) pending for over 15 minutes`] : []),
    ],
    windowDays: 30,
    since,
  });
});

/** GET /api/admin/wallet/deposits — search + filters + bounded pagination. */
export const listDeposits = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const q = {};
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.currency) q.currency = String(req.query.currency).toUpperCase();
  if (req.query.provider) q.provider = String(req.query.provider);
  if (req.query.userId) q.userId = req.query.userId;
  if (req.query.min || req.query.max) {
    q.amountMinor = {};
    if (req.query.min) q.amountMinor.$gte = Number(req.query.min);
    if (req.query.max) q.amountMinor.$lte = Number(req.query.max);
  }
  if (req.query.from || req.query.to) {
    q.createdAt = {};
    if (req.query.from) q.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) q.createdAt.$lte = new Date(req.query.to);
  }
  if (req.query.q) {
    // Reference, provider payment id, or an exact internal user id.
    const term = String(req.query.q).trim().slice(0, 64);
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (/^[a-f0-9]{24}$/i.test(term)) {
      q.$or = [{ userId: term }, { reference: term }];
    } else {
      q.$or = [{ reference: { $regex: `^${esc}` } }, { providerPaymentId: { $regex: `^${esc}` } }];
    }
  }

  const [items, total] = await Promise.all([
    WalletDeposit.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('userId', 'email name username').lean(),
    WalletDeposit.countDocuments(q),
  ]);
  return ok(res, 'Deposits', { items, page, limit, total, pages: Math.ceil(total / limit) || 1 });
});

/** GET /api/admin/wallet/transactions — cross-user ledger search. */
export const listTransactions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const q = {};
  if (req.query.type) q.type = String(req.query.type);
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.currency) q.currency = String(req.query.currency).toUpperCase();
  if (req.query.userId) q.userId = req.query.userId;
  if (req.query.reference) q.reference = String(req.query.reference);
  if (req.query.from || req.query.to) {
    q.createdAt = {};
    if (req.query.from) q.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) q.createdAt.$lte = new Date(req.query.to);
  }
  const [items, total] = await Promise.all([
    WalletLedger.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('userId', 'email name username').lean(),
    WalletLedger.countDocuments(q),
  ]);
  return ok(res, 'Ledger', { items, page, limit, total, pages: Math.ceil(total / limit) || 1 });
});

/** GET /api/admin/wallet/accounts — balances + discrepancy flags. */
export const listAccounts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const q = {};
  if (req.query.currency) q.currency = String(req.query.currency).toUpperCase();
  const [items, total] = await Promise.all([
    WalletAccount.find(q).sort({ availableMinor: -1 }).skip(skip).limit(limit)
      .populate('userId', 'email name username').lean(),
    WalletAccount.countDocuments(q),
  ]);
  return ok(res, 'Accounts', { items, page, limit, total, pages: Math.ceil(total / limit) || 1 });
});

/** GET /api/admin/wallet/webhooks — Whop delivery/processing status. */
export const listWebhooks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const q = {};
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.type) q.type = String(req.query.type);
  const [items, total] = await Promise.all([
    WhopEvent.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    WhopEvent.countDocuments(q),
  ]);
  return ok(res, 'Webhook events', { items, page, limit, total, pages: Math.ceil(total / limit) || 1 });
});

/** GET /api/admin/wallet/reconciliation — replay ledgers vs projections. */
export const reconciliation = asyncHandler(async (_req, res) => {
  const report = await reconcileMany({ limit: 500 });
  return ok(res, 'Reconciliation report', report);
});

/** GET /api/admin/wallet/config — provider mode/presence, never secrets. */
export const providerConfig = asyncHandler(async (_req, res) => {
  return ok(res, 'Wallet provider config', {
    provider: whopProviderStatus(),
    presets: depositPresets().map((p) => ({ amountMinor: p.amountMinor, amount: p.amount })),
    depositsEnabled: process.env.WALLET_DEPOSITS_ENABLED === 'true',
    // Explicit, so the admin panel can show what still blocks going live.
    liveBlockers: buildLiveBlockers(),
  });
});

function buildLiveBlockers() {
  const blockers = [];
  if (!whopConfigured()) blockers.push('WHOP_COMPANY_API_KEY / WHOP_COMPANY_ID are not set.');
  if (!process.env.WHOP_WEBHOOK_SECRET) blockers.push('WHOP_WEBHOOK_SECRET is not set — no webhook can be verified.');
  if (!depositPresets().length) blockers.push('WHOP_DEPOSIT_PLAN_IDS has no preset checkout links.');
  if (process.env.WHOP_SANDBOX === 'true') blockers.push('WHOP_SANDBOX=true — running against the sandbox, not live.');
  if (process.env.WALLET_DEPOSITS_ENABLED !== 'true') {
    blockers.push('WALLET_DEPOSITS_ENABLED is not true — top-ups are gated off pending provider approval for the stored-value use case and the applicable licensing.');
  }
  return blockers;
}

// ---------------------------------------------------------------------------
// Audited refund: provider refund FIRST, then an explicit reversal entry.
// ---------------------------------------------------------------------------
export const refundDeposit = asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) throw new AppError('A refund reason is required', 400, 'REASON_REQUIRED');

  const deposit = await getDeposit(req.params.reference); // admin-scoped: no userId
  if (deposit.status !== 'paid') {
    throw new AppError(`Only a confirmed deposit can be refunded (status: ${deposit.status})`, 409, 'DEPOSIT_NOT_CONFIRMED');
  }
  if (!deposit.providerPaymentId) {
    throw new AppError('This deposit has no provider payment id, so it cannot be refunded at the provider.', 409, 'NO_PROVIDER_PAYMENT');
  }

  // 1. Refund at the provider (real money movement, real credentials).
  let refund;
  try {
    refund = await refundDepositPayment(deposit.providerPaymentId, deposit.amountMinor, reason);
  } catch (e) {
    // Never reverse the local ledger unless the provider actually refunded.
    if (e instanceof AppError) throw e;
    throw new AppError('The payment provider rejected this refund.', 502, 'PROVIDER_REFUND_FAILED');
  }

  // 2. Record the reversal as a NEW immutable ledger entry (idempotent).
  const r = await reverseDeposit({
    reference: deposit.reference,
    actorId: req.user.sub,
    reason: `Provider refund: ${reason}`,
  });

  return ok(res, r.alreadyRefunded ? 'Already refunded' : 'Deposit refunded', {
    deposit: r.deposit,
    refundId: refund?.id || null,
    alreadyRefunded: !!r.alreadyRefunded,
  });
});

// ---------------------------------------------------------------------------
// Audited balance adjustment. Superadmin only; credits need evidence.
// ---------------------------------------------------------------------------
export const adjustBalance = asyncHandler(async (req, res) => {
  const { userId, amountMinor, reason, evidenceRef } = req.body;
  const user = await User.findById(userId).select('_id').lean();
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

  const result = await adminAdjust({
    actorId: req.user.sub,
    userId,
    amountMinor,
    reason,
    evidenceRef,
  });
  return ok(res, 'Adjustment applied', {
    ledger: result.ledger,
    availableMinor: result.account.availableMinor,
    pendingMinor: result.account.pendingMinor,
  });
});

/** GET /api/admin/wallet/accounts/:userId/reconcile — single account check. */
export const reconcileOne = asyncHandler(async (req, res) => {
  const report = await reconcileAccount(req.params.userId, process.env.WALLET_CURRENCY || 'USD');
  return ok(res, 'Reconciliation result', report);
});

export { CURRENCY };
