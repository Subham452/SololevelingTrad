import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import WalletAccount from '../models/WalletAccount.js';
import WalletLedger from '../models/WalletLedger.js';
import WalletDeposit, { nextDepositReference } from '../models/WalletDeposit.js';
import AuditLog from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';
import { depositPresets, resolveDepositPreset, whopConfigured, whopEnvironment, whopWebhookConfigured } from './whopService.js';

// ---------------------------------------------------------------------------
// Real-money wallet service.
//
// Rules enforced here (and nowhere else):
//   1. All money is INTEGER minor units. No float arithmetic, ever.
//   2. Balances move only via atomic `$inc` on WalletAccount, guarded by
//      `availableMinor: { $gte }` so concurrent spends cannot overspend.
//   3. Exactly-once is enforced by the UNIQUE `idemKey` on WalletLedger plus a
//      conditional status claim on the deposit. Every duplicate path has an
//      explicit compensating rollback.
//   4. Ledger rows are append-only. Refunds/reversals/corrections are NEW rows.
//   5. The browser is never trusted: it supplies only a preset amount and an
//      idempotency key. It cannot assert a price, a status or a balance.
// ---------------------------------------------------------------------------

const currency = () => env.WALLET_CURRENCY;
const isDuplicate = (e) => e && (e.code === 11000 || e?.cause?.code === 11000);
// `appendLedger` translates Mongo's E11000 into AppError(LEDGER_DUPLICATE), so
// every caller must recognise BOTH shapes — otherwise a legitimate concurrent
// duplicate is misreported as a failure instead of being treated as "already
// recorded", and the compensating rollback would be thrown away.
const isLedgerDuplicate = (e) =>
  isDuplicate(e) || (e instanceof AppError && e.code === 'LEDGER_DUPLICATE');

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** Get or create the projection row (single atomic upsert). */
export async function ensureAccount(userId, cur = currency()) {
  const existing = await WalletAccount.findOne({ userId, currency: cur });
  if (existing) return existing;
  try {
    return await WalletAccount.create({ userId, currency: cur, availableMinor: 0, pendingMinor: 0 });
  } catch (e) {
    if (isDuplicate(e)) return WalletAccount.findOne({ userId, currency: cur }); // raced
    throw e;
  }
}

/**
 * Client-facing wallet summary. Never returns another user's data: the caller
 * always passes req.user.sub and it is used as the only filter.
 */
export async function getWallet(userId) {
  const cur = currency();
  const [account, pendingDeposits, paidAgg] = await Promise.all([
    ensureAccount(userId, cur),
    WalletDeposit.countDocuments({ userId, status: 'pending' }),
    WalletDeposit.aggregate([
      { $match: { userId, status: 'paid' } },
      { $group: { _id: null, totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    ]),
  ]);
  const totalDepositedMinor = paidAgg[0]?.totalMinor || 0;

  return {
    // Real money (separate from the paper-trading balances shown elsewhere).
    availableMinor: account.availableMinor,
    pendingMinor: account.pendingMinor,
    currency: cur,
    pendingDeposits,
    totalDepositsMinor: totalDepositedMinor,
    totalDepositsCount: paidAgg[0]?.count || 0,
    // Withdrawals are not offered — see depositsDisabledReason / docs.
    withdrawalsSupported: false,
    totalWithdrawalsMinor: 0,
    discrepancy: account.discrepancyAt ? { at: account.discrepancyAt, note: account.discrepancyNote } : null,
    limits: limits(),
    deposits: depositAvailability(),
  };
}

export function limits() {
  return {
    minMinor: env.WALLET_MIN_DEPOSIT_CENTS,
    maxMinor: env.WALLET_MAX_DEPOSIT_CENTS,
    currency: currency(),
    presets: depositPresets().map((p) => ({ amountMinor: p.amountMinor, amount: p.amount })),
  };
}

/** Honest availability state — never pretends a gated feature is live. */
export function depositAvailability() {
  const configured = whopConfigured() && whopWebhookConfigured() && depositPresets().length > 0;
  if (!env.WALLET_DEPOSITS_ENABLED) {
    return {
      available: false, reasonCode: 'NOT_APPROVED', reason: env.WALLET_DEPOSITS_UNAVAILABLE_REASON,
      provider: 'whop', providerLabel: 'Whop',
    };
  }
  if (!configured) {
    return {
      available: false, reasonCode: 'NOT_CONFIGURED',
      reason: 'Wallet top-ups are not configured on the server yet. Add the Whop credentials and checkout links, then enable deposits.',
      provider: 'whop', providerLabel: 'Whop',
    };
  }
  return {
    available: true, reasonCode: null, reason: null,
    provider: 'whop', providerLabel: 'Whop', environment: whopEnvironment(),
    presets: depositPresets().map((p) => ({ amountMinor: p.amountMinor, amount: p.amount })),
  };
}

// ---------------------------------------------------------------------------
// Ledger primitive
// ---------------------------------------------------------------------------

/**
 * Append an immutable ledger row describing a projection change that has
 * ALREADY been applied atomically to WalletAccount.
 * Throws AppError(LEDGER_DUPLICATE) when the idemKey has been used before.
 */
async function appendLedger({
  userId, cur = currency(), type, direction, amountMinor,
  deltaAvailableMinor, deltaPendingMinor, availableAfterMinor, pendingAfterMinor,
  idemKey, reference, status = 'confirmed', provider = 'internal',
  providerPaymentId = null, providerEventId = null, note = '', meta = null, reversesId = null,
}) {
  try {
    return await WalletLedger.create({
      userId, currency: cur, type, direction,
      amountMinor, deltaAvailableMinor, deltaPendingMinor,
      availableAfterMinor, pendingAfterMinor,
      idemKey, reference, status, provider, providerPaymentId, providerEventId,
      note, meta, reversesId, confirmedAt: status === 'confirmed' ? new Date() : null,
    });
  } catch (e) {
    if (isDuplicate(e)) {
      throw new AppError('Ledger entry already recorded', 409, 'LEDGER_DUPLICATE');
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Deposit creation (the only entry point for money IN)
// ---------------------------------------------------------------------------

export async function createDeposit({ userId, amountMinor, idempotencyKey }) {
  // Gate 1 — eligibility. Real top-ups stay OFF until the provider approves
  // the stored-value use case for this merchant/product.
  const availability = depositAvailability();
  if (!availability.available) {
    throw new AppError(availability.reason, 409, `WALLET_DEPOSITS_${availability.reasonCode}`);
  }

  // Idempotency: a double-clicked / retried submit returns the SAME deposit.
  if (idempotencyKey) {
    const existing = await WalletDeposit.findOne({ userId, idempotencyKey });
    if (existing) return { deposit: existing, duplicate: true };
  }

  // Gate 2 — the amount must be inside the server-side allow-list, which maps
  // to a Whop variant configured in the merchant dashboard. The client cannot
  // choose an arbitrary price.
  const preset = resolveDepositPreset(amountMinor);
  const cur = currency();

  const account = await ensureAccount(userId, cur);
  const reference = await nextDepositReference();
  const expiresAt = new Date(Date.now() + env.WALLET_DEPOSIT_EXPIRY_MINUTES * 60_000);

  const deposit = await WalletDeposit.create({
    reference,
    idempotencyKey: idempotencyKey || undefined,
    userId,
    amountMinor: preset.amountMinor,
    currency: cur,
    status: 'pending',
    provider: 'whop',
    providerPlanId: preset.planId,
    expiresAt,
  });

  // Move funds into PENDING (they are not spendable yet). Only a verified
  // webhook can move them into available.
  const updated = await WalletAccount.findOneAndUpdate(
    { _id: account._id },
    { $inc: { pendingMinor: preset.amountMinor } },
    { new: true },
  );
  try {
    const entry = await appendLedger({
      userId, cur, type: 'deposit_hold', direction: 'neutral',
      amountMinor: preset.amountMinor,
      deltaAvailableMinor: 0, deltaPendingMinor: preset.amountMinor,
      availableAfterMinor: updated.availableMinor,
      pendingAfterMinor: updated.pendingMinor,
      idemKey: `whop:${reference}:hold`, reference, status: 'pending',
      provider: 'whop', note: `Deposit ${reference} created — awaiting provider confirmation`,
      meta: { planId: preset.planId },
    });
    deposit.holdEntryId = entry._id;
    await deposit.save();
  } catch (e) {
    // Could not record the hold: unwind the pending hold so funds are not
    // stranded, then surface the failure.
    await WalletAccount.updateOne({ _id: account._id }, { $inc: { pendingMinor: -preset.amountMinor } });
    await WalletDeposit.deleteOne({ _id: deposit._id });
    logger.error('Wallet deposit hold failed', { reference, message: e?.message || 'error' });
    throw new AppError('Could not start the deposit. Please try again.', 502, 'DEPOSIT_CREATE_FAILED');
  }

  return { deposit, duplicate: false, preset };
}

// ---------------------------------------------------------------------------
// Deposit confirmation — EXACTLY ONCE, webhook-only
//
// Proof of payment is one of:
//   * a signature-verified Whop webhook (primary)
//   * an authenticated server-to-server payments.retrieve lookup (verify endpoint)
// The browser redirect NEVER reaches this function as proof.
// ---------------------------------------------------------------------------
export async function confirmDeposit({
  reference, providerPaymentId = null, providerEventId = null,
  providerAmount = null, providerCurrency = null, source = 'webhook',
}) {
  const dep = await WalletDeposit.findOne({ reference });
  if (!dep) return { found: false };
  if (dep.status === 'paid') return { found: true, alreadyPaid: true, deposit: dep };
  if (['failed', 'expired', 'refunded'].includes(dep.status)) {
    return { found: true, alreadyPaid: false, terminal: dep.status, deposit: dep };
  }

  // Cross-check the provider-reported amount against what we charged. A
  // mismatch is a reconciliation alarm — we do NOT credit a wrong amount.
  if (Number.isFinite(Number(providerAmount)) && Number(providerAmount) > 0) {
    const expected = Number((dep.amountMinor / 100).toFixed(2));
    if (Math.abs(Number(providerAmount) - expected) > 0.011) {
      logger.error('Whop amount mismatch — not crediting', {
        reference, expected, providerAmount, providerCurrency,
      });
      return { found: true, mismatch: true, expected, providerAmount, deposit: dep };
    }
  }

  // CLAIM: a single conditional transition serialises concurrent confirmations.
  const claimed = await WalletDeposit.findOneAndUpdate(
    { _id: dep._id, status: 'pending' },
    { $set: { status: 'paid', paidAt: new Date(), providerPaymentId, lastEventId: providerEventId, providerAmount, providerCurrency } },
    { new: true },
  );
  if (!claimed) {
    const fresh = await WalletDeposit.findOne({ _id: dep._id });
    return { found: true, alreadyPaid: fresh?.status === 'paid', terminal: fresh?.status, deposit: fresh };
  }

  const cur = dep.currency || currency();
  try {
    // Atomic pending -> available move. Guarded so we can never create funds
    // out of nothing if the hold was already released.
    const account = await WalletAccount.findOneAndUpdate(
      { userId: dep.userId, currency: cur, pendingMinor: { $gte: dep.amountMinor } },
      {
        $inc: {
          pendingMinor: -dep.amountMinor,
          availableMinor: dep.amountMinor,
          lifetimeDepositsMinor: dep.amountMinor,
        },
      },
      { new: true },
    );
    if (!account) {
      // Hold already consumed or never taken — do NOT credit twice.
      logger.error('Whop deposit confirmed without a matching hold', { reference, amountMinor: dep.amountMinor });
      await WalletDeposit.updateOne({ _id: dep._id, status: 'paid' }, { $set: { status: 'pending', paidAt: null } });
      return { found: true, discrepancy: true, deposit: dep };
    }

    const entry = await appendLedger({
      userId: dep.userId, cur, type: 'deposit_credit', direction: 'credit',
      amountMinor: dep.amountMinor,
      deltaAvailableMinor: dep.amountMinor, deltaPendingMinor: -dep.amountMinor,
      availableAfterMinor: account.availableMinor,
      pendingAfterMinor: account.pendingMinor,
      idemKey: `whop:${reference}:credit`, reference, status: 'confirmed',
      provider: 'whop', providerPaymentId, providerEventId,
      note: `Deposit ${reference} confirmed (${source})`,
      meta: { source, providerAmount, providerCurrency },
    });
    await WalletDeposit.updateOne({ _id: dep._id }, { $set: { creditEntryId: entry._id, settledAt: new Date() } });
    const final = await WalletDeposit.findOne({ _id: dep._id });
    return { found: true, alreadyPaid: false, deposit: final, ledger: entry };
  } catch (e) {
    if (isLedgerDuplicate(e)) {
      // Another attempt already wrote the credit row — undo our projection
      // change so the money is counted exactly once, and treat as a duplicate.
      await WalletAccount.updateOne(
        { userId: dep.userId, currency: cur },
        { $inc: { pendingMinor: dep.amountMinor, availableMinor: -dep.amountMinor, lifetimeDepositsMinor: -dep.amountMinor } },
      );
      return { found: true, alreadyPaid: true, deposit: dep };
    }
    // Unexpected failure: release the claim so Whop's retry can complete it.
    await WalletDeposit.updateOne({ _id: dep._id, status: 'paid' }, { $set: { status: 'pending', paidAt: null } });
    logger.error('Wallet deposit confirmation failed', { reference, message: e?.message || 'error' });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Release a hold that will never become real money (failed / expired)
// ---------------------------------------------------------------------------
async function releaseHold(deposit, type, reason) {
  if (!['pending'].includes(deposit.status)) return { changed: false, deposit };
  const cur = deposit.currency || currency();
  const updated = await WalletAccount.findOneAndUpdate(
    { userId: deposit.userId, currency: cur, pendingMinor: { $gte: deposit.amountMinor } },
    { $inc: { pendingMinor: -deposit.amountMinor } },
    { new: true },
  );
  if (!updated) return { changed: false, deposit };
  try {
    const entry = await appendLedger({
      userId: deposit.userId, cur, type, direction: 'neutral',
      amountMinor: deposit.amountMinor,
      deltaAvailableMinor: 0, deltaPendingMinor: -deposit.amountMinor,
      availableAfterMinor: updated.availableMinor,
      pendingAfterMinor: updated.pendingMinor,
      idemKey: `whop:${deposit.reference}:${type}`, reference: deposit.reference,
      status: 'confirmed', provider: 'whop', note: reason || '',
    });
    await WalletDeposit.updateOne({ _id: deposit._id }, { $set: { status: type === 'deposit_expired' ? 'expired' : 'failed', releaseEntryId: entry._id, failureReason: reason || null, settledAt: new Date() } });
    return { changed: true };
  } catch (e) {
    await WalletAccount.updateOne({ _id: updated._id }, { $inc: { pendingMinor: deposit.amountMinor } });
    if (isLedgerDuplicate(e)) return { changed: false, deposit };
    throw e;
  }
}

export async function failDeposit({ reference, reason }) {
  const dep = await WalletDeposit.findOne({ reference });
  if (!dep) return { found: false };
  return { found: true, ...(await releaseHold(dep, 'deposit_failed', reason || 'The payment provider reported this payment as unsuccessful.')) };
}

// ---------------------------------------------------------------------------
// Refund / reversal — an EXPLICIT new ledger event, never a rewrite
// ---------------------------------------------------------------------------
export async function reverseDeposit({ reference, actorId, reason, providerEventId = null }) {
  const dep = await WalletDeposit.findOne({ reference });
  if (!dep) throw new AppError('Deposit not found', 404, 'DEPOSIT_NOT_FOUND');
  if (dep.status === 'refunded') return { deposit: dep, alreadyRefunded: true };
  if (dep.status !== 'paid') throw new AppError('Only a confirmed deposit can be refunded', 409, 'DEPOSIT_NOT_CONFIRMED');

  const cur = dep.currency || currency();
  const account = await WalletAccount.findOneAndUpdate(
    { userId: dep.userId, currency: cur, availableMinor: { $gte: dep.amountMinor } },
    { $inc: { availableMinor: -dep.amountMinor } },
    { new: true },
  );
  if (!account) {
    // Funds already spent. Never allow a negative balance — flag for review.
    await WalletDeposit.updateOne({ _id: dep._id }, { $set: { failureReason: 'Refund blocked: available balance is lower than the deposit amount.' } });
    throw new AppError('Refund blocked: the available balance is lower than the deposit amount. Resolve the balance first.', 409, 'REFUND_INSUFFICIENT_BALANCE');
  }
  try {
    const entry = await appendLedger({
      userId: dep.userId, cur, type: 'deposit_reversed', direction: 'debit',
      amountMinor: dep.amountMinor,
      deltaAvailableMinor: -dep.amountMinor, deltaPendingMinor: 0,
      availableAfterMinor: account.availableMinor,
      pendingAfterMinor: account.pendingMinor,
      idemKey: `whop:${reference}:reversal`, reference, status: 'confirmed',
      provider: 'whop', providerEventId,
      reversesId: dep.creditEntryId || undefined,
      note: reason || 'Deposit refunded',
      meta: { actorId: actorId ? String(actorId) : null, reason: reason || null },
    });
    await WalletDeposit.updateOne({ _id: dep._id }, { $set: { status: 'refunded', failureReason: reason || null } });
    if (actorId) await audit(actorId, 'wallet_deposit_refund', reference, { amountMinor: dep.amountMinor, reason });
    return { deposit: await WalletDeposit.findOne({ _id: dep._id }), ledger: entry };
  } catch (e) {
    await WalletAccount.updateOne({ _id: account._id }, { $inc: { availableMinor: dep.amountMinor } });
    if (isLedgerDuplicate(e)) return { deposit: dep, alreadyRefunded: true };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Guarded DEBIT — the primitive for spending real funds.
//
// Atomic and non-overspending under concurrency: the `$gte` guard means the
// decrement only happens if the funds are actually there, and the UNIQUE
// idemKey stops the same intent from being spent twice (with a compensating
// rollback if it tries).
//
// NOTE: intentionally not yet wired to a user-facing purchase flow — real
// wallet funds must not fund crypto trading or subscriptions until provider
// approval + compliance sign-off (see docs/WALLET.md).
// ---------------------------------------------------------------------------
export async function debitAvailable({
  userId, amountMinor, cur = currency(), idemKey, type = 'spend',
  reference = null, note = '', meta = null, provider = 'internal',
}) {
  const amount = Number(amountMinor);
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError('Invalid debit amount', 400, 'INVALID_AMOUNT');

  if (idemKey) {
    const existing = await WalletLedger.findOne({ idemKey });
    if (existing) return { ok: true, duplicate: true, ledger: existing };
  }

  const account = await WalletAccount.findOneAndUpdate(
    { userId, currency: cur, availableMinor: { $gte: amount } },
    { $inc: { availableMinor: -amount } },
    { new: true },
  );
  if (!account) return { ok: false, code: 'INSUFFICIENT_FUNDS' };

  try {
    const entry = await appendLedger({
      userId, cur, type, direction: 'debit',
      amountMinor: amount,
      deltaAvailableMinor: -amount, deltaPendingMinor: 0,
      availableAfterMinor: account.availableMinor,
      pendingAfterMinor: account.pendingMinor,
      idemKey, reference, provider, note, meta,
    });
    return { ok: true, duplicate: false, ledger: entry, account };
  } catch (e) {
    // Duplicate idemKey: undo the decrement so the spend happens exactly once.
    await WalletAccount.updateOne({ _id: account._id }, { $inc: { availableMinor: amount } });
    if (isLedgerDuplicate(e) && idemKey) {
      const existing = await WalletLedger.findOne({ idemKey });
      if (existing) return { ok: true, duplicate: true, ledger: existing };
      // The row vanished between the failed insert and this read (should not
      // happen); surface it rather than silently claiming success.
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Reads — always scoped to a single userId (ownership enforced by the query)
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = new Set([
  'deposit_hold', 'deposit_credit', 'deposit_expired', 'deposit_reversed', 'deposit_failed',
  'withdrawal_hold', 'withdrawal_debit', 'withdrawal_released', 'adjustment', 'fee', 'spend', 'spend_refund',
]);
const ALLOWED_STATUSES = new Set(['confirmed', 'pending', 'reversed']);

export async function listTransactions({ userId, query = {}, page = 1, limit = 20 }) {
  const q = { userId };
  if (query.type && ALLOWED_TYPES.has(String(query.type))) q.type = String(query.type);
  if (query.status && ALLOWED_STATUSES.has(String(query.status))) q.status = String(query.status);
  if (query.provider) q.provider = String(query.provider);
  if (query.from || query.to) {
    q.createdAt = {};
    if (query.from) q.createdAt.$gte = new Date(query.from);
    if (query.to) q.createdAt.$lte = new Date(query.to);
  }
  if (query.q) {
    // Search by the human-facing reference (exact prefix is enough; no
    // unbounded regex from raw user input).
    const term = String(query.q).trim().slice(0, 64);
    if (term) q.reference = { $regex: `^${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` };
  }

  const [items, total] = await Promise.all([
    WalletLedger.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WalletLedger.countDocuments(q),
  ]);
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getTransaction(id, userId) {
  const doc = await WalletLedger.findOne({ _id: id, userId }).lean();
  if (!doc) throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  return doc;
}

export async function getDeposit(reference, userId) {
  const doc = userId
    ? await WalletDeposit.findOne({ reference, userId }).lean()
    : await WalletDeposit.findOne({ reference }).lean();
  if (!doc) throw new AppError('Deposit not found', 404, 'DEPOSIT_NOT_FOUND');
  return doc;
}

// ---------------------------------------------------------------------------
// Reconciliation — replay the ledger and compare against the projection
// ---------------------------------------------------------------------------
export async function reconcileAccount(userId, cur = currency()) {
  const account = await WalletAccount.findOne({ userId, currency: cur });
  const rows = await WalletLedger.find({ userId, currency: cur }).sort({ createdAt: 1, _id: 1 }).lean();

  const available = rows.reduce((s, r) => s + (r.deltaAvailableMinor || 0), 0);
  const pending = rows.reduce((s, r) => s + (r.deltaPendingMinor || 0), 0);
  const actualAvailable = account ? account.availableMinor : 0;
  const actualPending = account ? account.pendingMinor : 0;
  const ok = available === actualAvailable && pending === actualPending && available >= 0 && pending >= 0;

  const discrepancy = ok ? null : {
    expectedAvailableMinor: available,
    actualAvailableMinor: actualAvailable,
    expectedPendingMinor: pending,
    actualPendingMinor: actualPending,
    entries: rows.length,
    at: new Date(),
  };

  if (account) {
    await WalletAccount.updateOne({ _id: account._id }, {
      $set: {
        discrepancyAt: ok ? null : new Date(),
        discrepancyNote: ok ? null : `Ledger replay expects available=${available} pending=${pending}; projection has available=${actualAvailable} pending=${actualPending}`,
      },
    });
  }
  if (!ok) {
    logger.error('Wallet reconciliation mismatch', { userId: String(userId), ...discrepancy });
  }
  return { ok, discrepancy, account };
}

/** Admin: reconcile a batch of accounts and report only the unhealthy ones. */
export async function reconcileMany({ cur = currency(), limit = 200 } = {}) {
  const accounts = await WalletAccount.find({ currency: cur }).limit(limit).lean();
  const results = await Promise.all(accounts.map((a) => reconcileAccount(a.userId, cur)));
  return {
    checked: results.length,
    healthy: results.filter((r) => r.ok).length,
    mismatches: results.filter((r) => !r.ok).map((r) => ({ userId: String(r.account?.userId), ...r.discrepancy })),
  };
}

// ---------------------------------------------------------------------------
// Expire abandoned deposits (runs from the existing cleanup job)
// ---------------------------------------------------------------------------
export async function expireDueDeposits() {
  const due = await WalletDeposit.find({ status: 'pending', expiresAt: { $lt: new Date() } }).limit(200);
  let count = 0;
  for (const dep of due) {
    const r = await releaseHold(dep, 'deposit_expired', 'Checkout was not completed before the deposit expired.');
    if (r.changed) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Admin: audited, evidence-based correction. Never a "mark as paid" button.
// ---------------------------------------------------------------------------
export async function adminAdjust({ actorId, userId, amountMinor, reason, evidenceRef }) {
  const amount = Number(amountMinor);
  if (!Number.isInteger(amount) || amount === 0) throw new AppError('Adjustment amount must be a non-zero integer minor unit', 400, 'INVALID_AMOUNT');
  if (!reason || String(reason).trim().length < 10) throw new AppError('A reason of at least 10 characters is required', 400, 'REASON_REQUIRED');
  if (amount > 0 && (!evidenceRef || String(evidenceRef).trim().length < 4)) {
    throw new AppError('A credit requires a verified evidence reference (provider payment or case id)', 400, 'EVIDENCE_REQUIRED');
  }

  const cur = currency();
  const account = await ensureAccount(userId, cur);
  if (amount < 0) {
    const guard = await WalletAccount.findOneAndUpdate(
      { _id: account._id, availableMinor: { $gte: Math.abs(amount) } },
      { $inc: { availableMinor: amount } },
      { new: true },
    );
    if (!guard) throw new AppError('Adjustment would make the balance negative', 409, 'INSUFFICIENT_FUNDS');
  } else {
    await WalletAccount.updateOne({ _id: account._id }, { $inc: { availableMinor: amount } });
  }
  const after = await WalletAccount.findOne({ _id: account._id });

  const entry = await appendLedger({
    userId, cur, type: 'adjustment', direction: amount > 0 ? 'credit' : 'debit',
    amountMinor: Math.abs(amount),
    deltaAvailableMinor: amount, deltaPendingMinor: 0,
    availableAfterMinor: after.availableMinor,
    pendingAfterMinor: after.pendingMinor,
    idemKey: `adj:${String(actorId)}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    reference: evidenceRef || null, provider: 'internal',
    note: reason,
    meta: { actorId: String(actorId), evidenceRef: evidenceRef || null, reason },
  });
  await audit(actorId, 'wallet_adjustment', String(entry._id), { userId: String(userId), amountMinor: amount, reason, evidenceRef });
  return { ledger: entry, account: after };
}

async function audit(actorId, action, target, meta) {
  try { await AuditLog.create({ actorId, action, target: String(target), meta }); } catch { /* never break the money path */ }
}
export { audit };
