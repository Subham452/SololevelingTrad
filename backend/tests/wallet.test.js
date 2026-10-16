import test, { after } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Real-money wallet invariants — the tests that must never lie.
//
// These exercise the ACTUAL MongoDB uniqueness constraints and atomic
// conditional updates (not a mocked model), because those are precisely the
// mechanisms that prevent double credit and overspend.
//
// They need a real mongod. An in-memory server is started below; if its binary
// cannot be obtained in this environment the whole file is reported as SKIPPED
// (never silently passed) so nobody mistakes an unrun test for a green one.
//
// Test credentials below are obviously fake fixtures, never real values.
// ---------------------------------------------------------------------------

process.env.WALLET_DEPOSITS_ENABLED = 'true';
process.env.WHOP_COMPANY_API_KEY = 'apik_test_only_not_a_real_key';
process.env.WHOP_COMPANY_ID = 'biz_test_only';
process.env.WHOP_WEBHOOK_SECRET = 'ws_test_only_not_a_real_secret';
process.env.WHOP_SANDBOX = 'true';
process.env.WHOP_DEPOSIT_PLAN_IDS = '2500:plan_test_2500,5000:plan_test_5000';
process.env.WALLET_MIN_DEPOSIT_CENTS = '500';
process.env.WALLET_MAX_DEPOSIT_CENTS = '50000';

// `skip` is consumed by every test's options below: if the in-memory database
// could not be started the whole file reports SKIPPED, never a false pass.
let skip = 'in-memory MongoDB not started';
let wallet = null;
let mongoose = null;
let WalletAccount = null;
let WalletLedger = null;
let WalletDeposit = null;
let WhopEvent = null;
let AuditLog = null;
let mongod = null;

try {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  mongoose = (await import('mongoose')).default;
  await mongoose.connect(mongod.getUri(), { dbName: 'wallet_test' });

  wallet = await import('../services/walletService.js');
  WalletAccount = (await import('../models/WalletAccount.js')).default;
  WalletLedger = (await import('../models/WalletLedger.js')).default;
  WalletDeposit = (await import('../models/WalletDeposit.js')).default;
  WhopEvent = (await import('../models/WhopEvent.js')).default;
  AuditLog = (await import('../models/AuditLog.js')).default;

  // Build the declared indexes. The UNIQUE ones are load-bearing: without
  // them, "exactly once" would be unenforceable under concurrency.
  await Promise.all([
    WalletAccount.init(), WalletLedger.init(), WalletDeposit.init(), WhopEvent.init(), AuditLog.init(),
  ]);
  skip = false;
  // Without this the open mongoose connection and the mongod child process keep
  // the event loop alive forever and `node --test` never exits.
  after(async () => {
    try { await mongoose.disconnect(); } catch { /* already gone */ }
    try { await mongod.stop(); } catch { /* already gone */ }
  });
} catch (e) {
  skip = `in-memory MongoDB unavailable (${e?.code || e?.name || 'error'}): ${String(e?.message || e).slice(0, 200)}`;
}

const oid = () => new mongoose.Types.ObjectId();
const accountOf = (userId) => WalletAccount.findOne({ userId, currency: 'USD' });
const ledgerOf = (userId) => WalletLedger.find({ userId }).sort({ createdAt: 1, _id: 1 });

/** Fund a user through the real deposit + confirmation path. */
async function fund(userId, amountMinor, tag) {
  const { deposit } = await wallet.createDeposit({
    userId, amountMinor, idempotencyKey: `fund-${tag}-${amountMinor}`,
  });
  const r = await wallet.confirmDeposit({ reference: deposit.reference, providerPaymentId: `pay_${tag}` });
  assert.equal(r.alreadyPaid, false, 'first confirmation must not be a duplicate');
  return deposit.reference;
}

// ---------------------------------------------------------------------------
// Deposit creation: pending is separate from available
// ---------------------------------------------------------------------------

test('createDeposit holds funds as PENDING, never as available', { skip }, async () => {
  const user = oid();
  const { deposit, duplicate } = await wallet.createDeposit({ userId: user, amountMinor: 2500, idempotencyKey: 'idem-create-1' });
  assert.equal(duplicate, false);
  assert.equal(deposit.status, 'pending');

  const acct = await accountOf(user);
  assert.equal(acct.availableMinor, 0, 'unconfirmed money must not be spendable');
  assert.equal(acct.pendingMinor, 2500, 'the hold sits in pending');

  const rows = await ledgerOf(user);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'deposit_hold');
  assert.equal(rows[0].deltaAvailableMinor, 0);
  assert.equal(rows[0].deltaPendingMinor, 2500);
  assert.equal(rows[0].availableAfterMinor, 0, 'the projection must be reproducible from the ledger');
});

test('a repeated idempotency key returns the SAME deposit with no extra hold', { skip }, async () => {
  const user = oid();
  const first = await wallet.createDeposit({ userId: user, amountMinor: 5000, idempotencyKey: 'idem-double' });
  const second = await wallet.createDeposit({ userId: user, amountMinor: 5000, idempotencyKey: 'idem-double' });

  assert.equal(second.duplicate, true);
  assert.equal(second.deposit.reference, first.deposit.reference, 'the same deposit must be returned');

  const acct = await accountOf(user);
  assert.equal(acct.pendingMinor, 5000, 'a double submit must not double-hold funds');
  assert.equal((await ledgerOf(user)).length, 1);
});

test('the browser cannot choose its own amount — only configured presets are accepted', { skip }, async () => {
  const user = oid();
  await assert.rejects(
    () => wallet.createDeposit({ userId: user, amountMinor: 3333, idempotencyKey: 'idem-bad-amount' }),
    (e) => e.code === 'DEPOSIT_AMOUNT_NOT_OFFERED',
  );
  await assert.rejects(
    () => wallet.createDeposit({ userId: user, amountMinor: 5000.5, idempotencyKey: 'idem-bad-amount-2' }),
    (e) => e.code === 'DEPOSIT_AMOUNT_OUT_OF_RANGE' || e.code === 'INVALID_AMOUNT',
  );
  assert.equal(await WalletDeposit.countDocuments({ userId: user }), 0, 'nothing may be created for a rejected amount');
  assert.equal(await WalletAccount.countDocuments({ userId: user }), 0);
});

// ---------------------------------------------------------------------------
// Confirmation: EXACTLY ONCE
// ---------------------------------------------------------------------------

test('confirmation credits exactly once across sequential calls', { skip }, async () => {
  const user = oid();
  const { deposit } = await wallet.createDeposit({ userId: user, amountMinor: 2500, idempotencyKey: 'idem-seq' });

  const first = await wallet.confirmDeposit({ reference: deposit.reference, providerPaymentId: 'pay_seq' });
  assert.equal(first.alreadyPaid, false);
  const second = await wallet.confirmDeposit({ reference: deposit.reference, providerPaymentId: 'pay_seq' });
  assert.equal(second.alreadyPaid, true, 'the second call must be a no-op');

  const acct = await accountOf(user);
  assert.equal(acct.availableMinor, 2500, 'credited exactly once');
  assert.equal(acct.pendingMinor, 0, 'hold fully consumed');
  assert.equal(acct.lifetimeDepositsMinor, 2500);

  const rows = await ledgerOf(user);
  assert.deepEqual(rows.map((r) => r.type), ['deposit_hold', 'deposit_credit']);
  // Ledger replay must reconstruct the projection exactly.
  assert.equal(rows.at(-1).availableAfterMinor, acct.availableMinor);
  assert.equal(rows.at(-1).pendingAfterMinor, acct.pendingMinor);

  const report = await wallet.reconcileAccount(user);
  assert.equal(report.ok, true, 'the account must reconcile after a normal credit');
});

test('concurrent confirmations (duplicate webhook deliveries) credit exactly once', { skip }, async () => {
  const user = oid();
  const { deposit } = await wallet.createDeposit({ userId: user, amountMinor: 5000, idempotencyKey: 'idem-concurrent-confirm' });

  // Four deliveries racing on the same event — Whop retries are at-least-once.
  const results = await Promise.all(
    Array.from({ length: 4 }, (_, i) => wallet.confirmDeposit({
      reference: deposit.reference, providerPaymentId: 'pay_racing', providerEventId: `msg_racing_${i}`,
    })),
  );
  const credited = results.filter((r) => r.found && !r.alreadyPaid && !r.terminal);
  assert.equal(credited.length, 1, 'exactly one caller may perform the credit');

  const acct = await accountOf(user);
  assert.equal(acct.availableMinor, 5000, 'no double credit');
  assert.equal(acct.pendingMinor, 0);

  const credits = await WalletLedger.find({ userId: user, type: 'deposit_credit' });
  assert.equal(credits.length, 1, 'exactly one credit ledger row');
  assert.equal((await wallet.reconcileAccount(user)).ok, true);
});

test('a duplicate idempotency key on the ledger row is rejected by the UNIQUE index', { skip }, async () => {
  const user = oid();
  const base = {
    userId: user, currency: 'USD', type: 'adjustment', direction: 'credit',
    amountMinor: 100, deltaAvailableMinor: 100, deltaPendingMinor: 0,
    availableAfterMinor: 100, pendingAfterMinor: 0, idemKey: 'fixed-idem-key',
  };
  await WalletLedger.create(base);
  await assert.rejects(
    () => WalletLedger.create(base),
    (e) => e.code === 11000,
    'the database itself must refuse a second write of the same idempotency key',
  );
});

test('an amount mismatch is held for review instead of crediting a wrong amount', { skip }, async () => {
  const user = oid();
  const { deposit } = await wallet.createDeposit({ userId: user, amountMinor: 2500, idempotencyKey: 'idem-mismatch' });

  const r = await wallet.confirmDeposit({
    reference: deposit.reference, providerPaymentId: 'pay_mismatch', providerAmount: 999.99,
  });
  assert.equal(r.mismatch, true, 'a mismatch must be flagged, not credited');

  const acct = await accountOf(user);
  assert.equal(acct.availableMinor, 0, 'nothing may be credited on mismatch');
  assert.equal(acct.pendingMinor, 2500, 'the hold stays put for investigation');
  assert.equal((await WalletDeposit.findOne({ reference: deposit.reference })).status, 'pending');
});

test('an abandoned deposit expires, releasing only its hold', { skip }, async () => {
  const user = oid();
  const { deposit } = await wallet.createDeposit({ userId: user, amountMinor: 2500, idempotencyKey: 'idem-expire' });
  await WalletDeposit.updateOne({ _id: deposit._id }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });

  const released = await wallet.expireDueDeposits();
  assert.ok(released >= 1, 'the due deposit should be released');

  const acct = await accountOf(user);
  assert.equal(acct.pendingMinor, 0, 'hold released');
  assert.equal(acct.availableMinor, 0, 'expiry must never create money');

  const again = await wallet.expireDueDeposits();
  assert.equal(again, 0, 'expiry must be idempotent on a second run');
  assert.equal((await WalletDeposit.findOne({ reference: deposit.reference })).status, 'expired');
});

// ---------------------------------------------------------------------------
// Spending: no overspend, no double-spend, never negative
// ---------------------------------------------------------------------------

test('concurrent spending cannot overspend available funds', { skip }, async () => {
  const user = oid();
  await fund(user, 5000, 'spender');

  // 10 simultaneous debits of 900 against a 5000 balance: only 5 can fit.
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => wallet.debitAvailable({
      userId: user, amountMinor: 900, idemKey: `spend-concurrent-${i}`, note: 'test spend',
    })),
  );
  const ok = results.filter((r) => r.ok && !r.duplicate);
  assert.equal(ok.length, 5, 'exactly floor(5000/900) debits may succeed');

  const acct = await accountOf(user);
  assert.equal(acct.availableMinor, 500, 'balance must be exactly the remainder');
  assert.ok(acct.availableMinor >= 0, 'the balance may never go negative');
  assert.equal((await wallet.reconcileAccount(user)).ok, true, 'the ledger must still reconcile');
});

test('the same idempotency key can only ever spend once', { skip }, async () => {
  const user = oid();
  await fund(user, 5000, 'dupe');

  const results = await Promise.all(
    Array.from({ length: 5 }, () => wallet.debitAvailable({
      userId: user, amountMinor: 1000, idemKey: 'same-intent', note: 'double click',
    })),
  );
  const performed = results.filter((r) => r.ok && !r.duplicate);
  assert.equal(performed.length, 1, 'only one of five identical intents may take the money');

  const acct = await accountOf(user);
  assert.equal(acct.availableMinor, 4000, 'spent exactly once');
  assert.equal((await wallet.reconcileAccount(user)).ok, true);
});

test('a debit beyond the balance is refused and never drives it negative', { skip }, async () => {
  const user = oid();
  await fund(user, 2500, 'small');

  const r = await wallet.debitAvailable({ userId: user, amountMinor: 999_999, idemKey: 'too-big', note: 'overspend attempt' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INSUFFICIENT_FUNDS');

  const acct = await accountOf(user);
  assert.equal(acct.availableMinor, 2500, 'a refused debit must not change the balance');
  assert.ok(acct.availableMinor >= 0);
});

test('a balance correction can never make the balance negative', { skip }, async () => {
  const user = oid();
  await fund(user, 2500, 'adj');

  await assert.rejects(
    () => wallet.adminAdjust({ actorId: oid(), userId: user, amountMinor: -999_999, reason: 'Attempting to force a negative balance' }),
    (e) => e.code === 'INSUFFICIENT_FUNDS',
  );
  const acct = await accountOf(user);
  assert.equal(acct.availableMinor, 2500);
  assert.ok(acct.availableMinor >= 0);
});

// ---------------------------------------------------------------------------
// Refunds / reversals are explicit new events
// ---------------------------------------------------------------------------

test('a refund writes a NEW reversal entry and is idempotent', { skip }, async () => {
  const user = oid();
  const actor = oid();
  const reference = await fund(user, 5000, 'refundable');

  const first = await wallet.reverseDeposit({ reference, actorId: actor, reason: 'Sandbox refund test' });
  assert.equal(first.alreadyRefunded, undefined);
  assert.equal((await accountOf(user)).availableMinor, 0);

  const second = await wallet.reverseDeposit({ reference, actorId: actor, reason: 'Sandbox refund test' });
  assert.equal(second.alreadyRefunded, true, 'a second refund must be a no-op');

  const rows = await ledgerOf(user);
  assert.deepEqual(rows.map((r) => r.type), ['deposit_hold', 'deposit_credit', 'deposit_reversed'],
    'history is preserved — nothing is deleted or rewritten');
  assert.equal((await WalletDeposit.findOne({ reference })).status, 'refunded');
  assert.equal((await wallet.reconcileAccount(user)).ok, true);
  assert.ok(await AuditLog.exists({ action: 'wallet_deposit_refund' }), 'the refund must be audited');
});

test('refunding money that has already been spent is blocked instead of going negative', { skip }, async () => {
  const user = oid();
  const reference = await fund(user, 2500, 'spent');
  const spend = await wallet.debitAvailable({ userId: user, amountMinor: 2500, idemKey: 'drain-it', note: 'drain' });
  assert.equal(spend.ok, true);

  await assert.rejects(
    () => wallet.reverseDeposit({ reference, actorId: oid(), reason: 'Refund after funds spent' }),
    (e) => e.code === 'REFUND_INSUFFICIENT_BALANCE',
  );
  const acct = await accountOf(user);
  assert.equal(acct.availableMinor, 0);
  assert.ok(acct.availableMinor >= 0, 'never negative under any circumstance');
  assert.equal((await WalletDeposit.findOne({ reference })).status, 'paid',
    'a blocked refund must not claim to have refunded');
});

// ---------------------------------------------------------------------------
// Ownership: no cross-user reads or writes
// ---------------------------------------------------------------------------

test('wallet data is scoped to its owner (no cross-user access)', { skip }, async () => {
  const owner = oid();
  const stranger = oid();
  const reference = await fund(owner, 5000, 'private');

  // Another user cannot see the deposit…
  await assert.rejects(() => wallet.getDeposit(reference, stranger), (e) => e.code === 'DEPOSIT_NOT_FOUND');
  // …or read one of its ledger entries.
  const entry = (await ledgerOf(owner))[0];
  await assert.rejects(() => wallet.getTransaction(entry._id, stranger), (e) => e.code === 'TRANSACTION_NOT_FOUND');

  // The owner can, and every returned row belongs to them.
  const mine = await wallet.getDeposit(reference, owner);
  assert.equal(mine.reference, reference);

  const list = await wallet.listTransactions({ userId: stranger, query: {}, page: 1, limit: 50 });
  assert.equal(list.total, 0, 'a different user sees none of this wallet’s history');
  assert.ok(list.items.every((r) => String(r.userId) === String(stranger)));

  // A stranger's balance is untouched by the owner's activity.
  assert.equal((await accountOf(stranger))?.availableMinor ?? 0, 0);
});

test('the wallet summary only ever reports the calling user’s own numbers', { skip }, async () => {
  const user = oid();
  const other = oid();
  await fund(user, 5000, 'summary');
  await fund(other, 2500, 'summary-other');

  const mine = await wallet.getWallet(user);
  assert.equal(mine.availableMinor, 5000);
  assert.equal(mine.totalDepositsMinor, 5000);
  assert.equal(mine.pendingMinor, 0);

  const theirs = await wallet.getWallet(other);
  assert.equal(theirs.availableMinor, 2500, 'balances must not bleed across users');
  assert.equal(theirs.totalDepositsMinor, 2500);
});

// ---------------------------------------------------------------------------
// Reconciliation must actually catch corruption
// ---------------------------------------------------------------------------

test('reconciliation flags a projection that disagrees with the ledger', { skip }, async () => {
  const user = oid();
  await fund(user, 5000, 'recon');
  assert.equal((await wallet.reconcileAccount(user)).ok, true);

  // Simulate a corrupted/drifting projection.
  await WalletAccount.updateOne({ userId: user, currency: 'USD' }, { $inc: { availableMinor: 12345 } });
  const report = await wallet.reconcileAccount(user);
  assert.equal(report.ok, false, 'the discrepancy must be detected');
  assert.equal(report.discrepancy.expectedAvailableMinor, 5000, 'the ledger is the source of truth');
  assert.equal(report.discrepancy.actualAvailableMinor, 5000 + 12345, 'the projection has drifted by exactly what we injected');

  const acct = await accountOf(user);
  assert.ok(acct.discrepancyAt, 'the account must be visibly flagged for admins');
  assert.match(acct.discrepancyNote, /Ledger replay expects/);
});

test('an audited adjustment requires reason and (for credits) evidence', { skip }, async () => {
  const user = oid();
  const actor = oid();

  await assert.rejects(
    () => wallet.adminAdjust({ actorId: actor, userId: user, amountMinor: 1000, reason: 'short' }),
    (e) => e.code === 'REASON_REQUIRED',
    'a credit with no real reason must be refused',
  );
  await assert.rejects(
    () => wallet.adminAdjust({ actorId: actor, userId: user, amountMinor: 1000, reason: 'Verified provider correction for support case 42' }),
    (e) => e.code === 'EVIDENCE_REQUIRED',
    'crediting real money without evidence must be refused',
  );
  assert.equal((await accountOf(user))?.availableMinor ?? 0, 0, 'nothing may have been credited');

  const result = await wallet.adminAdjust({
    actorId: actor, userId: user, amountMinor: 1000,
    reason: 'Verified provider correction for support case 42', evidenceRef: 'pay_evidence_1',
  });
  assert.equal(result.account.availableMinor, 1000);
  const rows = await ledgerOf(user);
  assert.equal(rows.at(-1).type, 'adjustment', 'a correction is a new entry, never an edit');
  assert.ok(await AuditLog.exists({ action: 'wallet_adjustment' }), 'the adjustment must be audited');
  assert.equal((await wallet.reconcileAccount(user)).ok, true);
});

// ---------------------------------------------------------------------------
// Provider event journal: at-least-once delivery without double processing
// ---------------------------------------------------------------------------

test('a redelivered webhook event id is rejected by the UNIQUE constraint', { skip }, async () => {
  await WhopEvent.create({ provider: 'whop', eventId: 'msg_redelivered', type: 'payment.succeeded', status: 'received' });
  await assert.rejects(
    () => WhopEvent.create({ provider: 'whop', eventId: 'msg_redelivered', type: 'payment.succeeded', status: 'received' }),
    (e) => e.code === 11000,
    'the same webhook-id must not be journaled twice',
  );
  assert.equal(await WhopEvent.countDocuments({ eventId: 'msg_redelivered' }), 1);
});
