import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import { ok } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';
import {
  getWallet, limits, depositAvailability, createDeposit,
  listTransactions, getTransaction, getDeposit,
} from '../services/walletService.js';
import {
  publicCheckoutInfo, retrieveDepositPayment, whopProviderStatus, depositPresets,
} from '../services/whopService.js';
import { reconcileUnmatched } from './whopWebhookController.js';

// ---------------------------------------------------------------------------
// Wallet controller — REAL money. All ownership comes from req.user.sub and is
// passed as the only filter to the service. Nothing in a request body is ever
// used as a balance, a status or a price.
// ---------------------------------------------------------------------------

/** GET /api/wallet — summary for the signed-in user only. */
export const summary = asyncHandler(async (req, res) => {
  const wallet = await getWallet(req.user.sub);
  return ok(res, 'Wallet', {
    wallet,
    // Client-safe provider state (mode + presence, never a secret).
    provider: whopProviderStatus(),
  });
});

/** GET /api/wallet/transactions — search + filters + bounded pagination. */
export const transactions = asyncHandler(async (req, res) => {
  const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 1000);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const result = await listTransactions({ userId: req.user.sub, query: req.query, page, limit });
  return ok(res, 'Transactions', result);
});

/** GET /api/wallet/transactions/:id — one entry, ownership-scoped. */
export const transaction = asyncHandler(async (req, res) => {
  const doc = await getTransaction(req.params.id, req.user.sub);
  return ok(res, 'Transaction', { transaction: doc });
});

// ---------------------------------------------------------------------------
// POST /api/wallet/deposits — start a deposit.
//
// Creates a PENDING local record with a unique reference and idempotency key,
// holds the amount in `pendingMinor`, and returns only client-safe checkout
// info for Whop. The amount must be a configured preset — the browser never
// supplies a price.
// ---------------------------------------------------------------------------
export const createDepositHandler = asyncHandler(async (req, res) => {
  const { amountMinor, idempotencyKey } = req.body;
  const { deposit, duplicate } = await createDeposit({
    userId: req.user.sub,
    amountMinor,
    idempotencyKey,
  });

  return ok(res, duplicate ? 'Existing deposit returned' : 'Deposit created', {
    deposit: publicDeposit(deposit),
    // Whop Checkout element config — no secret, no price to assert.
    checkout: publicCheckoutInfo({ reference: deposit.reference, planId: deposit.providerPlanId }),
    limits: limits(),
  }, duplicate ? 200 : 201);
});

// ---------------------------------------------------------------------------
// GET /api/wallet/deposits/:reference — pending/confirmed state for polling.
// Also re-runs any provider event that arrived before this record existed.
// ---------------------------------------------------------------------------
export const depositStatus = asyncHandler(async (req, res) => {
  const deposit = await getDeposit(req.params.reference, req.user.sub);

  // Late-arriving webhook reconciliation (safe, idempotent).
  if (deposit.status === 'pending') {
    try { await reconcileUnmatched(deposit.reference); } catch (e) {
      logger.warn('Deposit reconciliation pass failed', { reference: deposit.reference, message: e?.message || 'error' });
    }
  }
  const fresh = await getDeposit(req.params.reference, req.user.sub);

  return ok(res, 'Deposit', {
    deposit: publicDeposit(fresh),
    // Whop appends ?payment=…&status=… to the return URL. Those values are
    // DISPLAY ONLY and are deliberately ignored for entitlement purposes.
    checkout: fresh.status === 'pending'
      ? publicCheckoutInfo({ reference: fresh.reference, planId: fresh.providerPlanId })
      : null,
    terminal: ['paid', 'failed', 'expired', 'refunded'].includes(fresh.status),
  });
});

// ---------------------------------------------------------------------------
// POST /api/wallet/deposits/:reference/verify — authoritative provider check.
//
// Used when the webhook has not arrived yet. The payment id the browser may
// carry is ONLY a lookup hint: it is re-fetched from Whop over a server-to-
// server call, must be `paid`, must carry OUR order reference in its metadata,
// and must match the amount we charged — otherwise nothing is credited.
// ---------------------------------------------------------------------------
export const verifyDeposit = asyncHandler(async (req, res) => {
  const deposit = await getDeposit(req.params.reference, req.user.sub);
  if (deposit.status === 'paid') return ok(res, 'Already confirmed', { deposit: publicDeposit(deposit), confirmed: true });

  const hint = String(req.body?.paymentId || '').trim();
  const paymentId = deposit.providerPaymentId || hint;
  if (!paymentId) {
    return ok(res, 'No payment reference yet', { deposit: publicDeposit(deposit), confirmed: false });
  }

  const result = await retrieveDepositPayment(paymentId);
  if (!result.confirmed) {
    // Not confirmed yet is NOT an error: keep polling instead of guessing.
    return ok(res, 'Payment not confirmed yet', { deposit: publicDeposit(deposit), confirmed: false, reason: result.reason });
  }

  // Bind the provider payment to THIS deposit before crediting anything.
  const returnedRef = result.metadata && (result.metadata.order_reference || result.metadata.reference);
  if (returnedRef && returnedRef !== deposit.reference) {
    logger.error('Whop payment reference mismatch — not crediting', {
      reference: deposit.reference, returnedRef, paymentId,
    });
    throw new AppError('This payment does not belong to this deposit', 409, 'PAYMENT_REFERENCE_MISMATCH');
  }
  if (result.amount != null) {
    const expected = Number((deposit.amountMinor / 100).toFixed(2));
    if (Math.abs(Number(result.amount) - expected) > 0.011) {
      logger.error('Whop payment amount mismatch — not crediting', {
        reference: deposit.reference, expected, providerAmount: result.amount,
      });
      throw new AppError('Payment amount does not match this deposit', 409, 'PAYMENT_AMOUNT_MISMATCH');
    }
  }

  const r = await confirmDepositSafe({ deposit, paymentId, source: 'verify' });
  return ok(res, r.credited ? 'Payment confirmed' : 'Payment confirmed (already processed)', {
    deposit: publicDeposit(r.deposit), confirmed: true, credited: r.credited,
  });
});

async function confirmDepositSafe({ deposit, paymentId, source }) {
  const { confirmDeposit } = await import('../services/walletService.js');
  const r = await confirmDeposit({
    reference: deposit.reference,
    providerPaymentId: paymentId,
    source,
    providerAmount: null, // already cross-checked against the retrieved payment
  });
  const fresh = await getDeposit(deposit.reference, deposit.userId);
  return { deposit: fresh, credited: r.found && !r.alreadyPaid && fresh.status === 'paid' };
}

// ---------------------------------------------------------------------------
// Public projections
// ---------------------------------------------------------------------------

/** Client-safe deposit view. No provider secrets, no internal ObjectId. */
export function publicDeposit(d) {
  if (!d) return null;
  const doc = d.toObject ? d.toObject() : d;
  return {
    reference: doc.reference,
    amountMinor: doc.amountMinor,
    amount: (Number(doc.amountMinor) / 100).toFixed(2),
    currency: doc.currency,
    status: doc.status,
    provider: doc.provider,
    providerLabel: 'Whop',
    environment: whopProviderStatus().environment,
    providerPaymentId: doc.providerPaymentId || null,
    failureReason: doc.failureReason || null,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    paidAt: doc.paidAt || null,
    settledAt: doc.settledAt || null,
    terminal: ['paid', 'failed', 'expired', 'refunded'].includes(doc.status),
    // Deliberately omitted: ledger ids, idempotency key, other users' data.
  };
}

/** GET /api/wallet/config — presets + availability for the Add Money screen. */
export const config = asyncHandler(async (_req, res) => {
  return ok(res, 'Wallet config', {
    availability: depositAvailability(),
    limits: limits(),
    presets: depositPresets().map((p) => ({ amountMinor: p.amountMinor, amount: p.amount })),
    currency: env.WALLET_CURRENCY,
    provider: whopProviderStatus(),
    withdrawalsSupported: false,
    withdrawalsNote: 'Withdrawals are not enabled on this deployment.',
  });
});
