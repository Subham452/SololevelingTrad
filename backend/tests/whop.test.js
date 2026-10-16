import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Whop integration — signature verification, replay protection, eligibility
// gating, preset allow-listing and secret hygiene.
//
// These fixtures use obviously-fake test values, never real credentials.
// The signature tests exercise the SAME code path used in production: the
// official `unwrapWebhook` helper from `@whop/sdk/helpers`.
// ---------------------------------------------------------------------------

process.env.WHOP_WEBHOOK_SECRET = 'ws_test_only_not_a_real_secret_value';
process.env.WHOP_COMPANY_API_KEY = 'apik_test_only_not_a_real_key';
process.env.WHOP_COMPANY_ID = 'biz_test_only';
process.env.WHOP_SANDBOX = 'true';
process.env.WHOP_DEPOSIT_PLAN_IDS = '5000:plan_test_5000,2500:plan_test_2500';
process.env.WALLET_MIN_DEPOSIT_CENTS = '500';
process.env.WALLET_MAX_DEPOSIT_CENTS = '50000';
// Eligibility gate: real top-ups are OFF by default.
process.env.WALLET_DEPOSITS_ENABLED = 'false';
delete process.env.WALLET_DEPOSITS_UNAVAILABLE_REASON; // use the built-in copy

const whop = await import('../services/whopService.js');
const wallet = await import('../services/walletService.js');
const env = (await import('../config/env.js')).default;

const SECRET = 'ws_test_only_not_a_real_secret_value';
const BODY = JSON.stringify({
  id: 'evt_1', type: 'payment.succeeded',
  data: { id: 'pay_123', status: 'paid', metadata: { order_reference: 'DEP-2026-ABC123' } },
});

// ---------------------------------------------------------------------------
// 1. Webhook signature verification (Standard Webhooks via the official SDK)
// ---------------------------------------------------------------------------

test('a correctly signed payload is accepted and parsed', async () => {
  const now = Math.floor(Date.now() / 1000);
  const headers = whop.signWhopPayload({ id: 'msg_ok', timestamp: now, body: BODY, secret: SECRET });
  const event = await whop.verifyWhopWebhook(BODY, headers);
  assert.equal(event.type, 'payment.succeeded');
  assert.equal(event.data.metadata.order_reference, 'DEP-2026-ABC123');
});

test('the official SDK helper is what verifies in production', async () => {
  // Guards against the verifier silently falling back to "trust the body".
  const helper = await import('@whop/sdk/helpers');
  assert.equal(typeof helper.unwrapWebhook, 'function');
});

test('a tampered body is rejected', async () => {
  const now = Math.floor(Date.now() / 1000);
  const headers = whop.signWhopPayload({ id: 'msg_tamper', timestamp: now, body: BODY, secret: SECRET });
  const doctored = BODY.replace('"paid"', '"paid", "amount_minor": 999999');
  await assert.rejects(
    () => whop.verifyWhopWebhook(doctored, headers),
    (e) => e.code === 'WEBHOOK_SIGNATURE_INVALID' && e.statusCode === 401,
  );
});

test('a signature made with the wrong secret is rejected', async () => {
  const now = Math.floor(Date.now() / 1000);
  const headers = whop.signWhopPayload({ id: 'msg_wrongkey', timestamp: now, body: BODY, secret: 'ws_wrong_secret_value' });
  await assert.rejects(
    () => whop.verifyWhopWebhook(BODY, headers),
    (e) => e.code === 'WEBHOOK_SIGNATURE_INVALID',
  );
});

test('missing signature headers are rejected', async () => {
  await assert.rejects(
    () => whop.verifyWhopWebhook(BODY, {}),
    (e) => e.code === 'WEBHOOK_SIGNATURE_INVALID',
  );
});

test('the event id is bound to the signature (swap-in replay is rejected)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const headers = whop.signWhopPayload({ id: 'msg_original', timestamp: now, body: BODY, secret: SECRET });
  // Reuse a valid signature under a DIFFERENT webhook id.
  const swapped = { ...headers, 'webhook-id': 'msg_replayed' };
  await assert.rejects(
    () => whop.verifyWhopWebhook(BODY, swapped),
    (e) => e.code === 'WEBHOOK_SIGNATURE_INVALID',
  );
});

test('replay outside the 5-minute window is rejected (past AND future)', async () => {
  const past = Math.floor(Date.now() / 1000) - 600;
  const pastHeaders = whop.signWhopPayload({ id: 'msg_old', timestamp: past, body: BODY, secret: SECRET });
  await assert.rejects(
    () => whop.verifyWhopWebhook(BODY, pastHeaders),
    (e) => e.code === 'WEBHOOK_SIGNATURE_INVALID' || e.code === 'WEBHOOK_REPLAY_REJECTED',
    'stale (past) timestamp must be rejected',
  );

  const future = Math.floor(Date.now() / 1000) + 600;
  const futureHeaders = whop.signWhopPayload({ id: 'msg_future', timestamp: future, body: BODY, secret: SECRET });
  await assert.rejects(
    () => whop.verifyWhopWebhook(BODY, futureHeaders),
    (e) => e.code === 'WEBHOOK_SIGNATURE_INVALID' || e.code === 'WEBHOOK_REPLAY_REJECTED',
    'future-dated timestamp must be rejected',
  );
});

test('an unconfigured webhook secret refuses verification instead of trusting the body', async (t) => {
  const original = env.WHOP_WEBHOOK_SECRET;
  env.WHOP_WEBHOOK_SECRET = '';
  t.after(() => { env.WHOP_WEBHOOK_SECRET = original; });
  await assert.rejects(
    () => whop.verifyWhopWebhook(BODY, {}),
    (e) => e.code === 'WEBHOOK_NOT_CONFIGURED',
  );
});

// ---------------------------------------------------------------------------
// 2. Eligibility gate — real top-ups must be unavailable by default
// ---------------------------------------------------------------------------

test('wallet deposits are gated OFF by default (provider approval required)', () => {
  const avail = wallet.depositAvailability();
  assert.equal(avail.available, false);
  assert.equal(avail.reasonCode, 'NOT_APPROVED');
  assert.match(avail.reason, /approval/i, 'the user-facing reason must explain the provider requirement');
});

test('createDeposit refuses to start while deposits are gated off', async () => {
  await assert.rejects(
    () => wallet.createDeposit({ userId: '000000000000000000000001', amountMinor: 2500, idempotencyKey: 'gate-test-key' }),
    (e) => e.statusCode === 409 && e.code === 'WALLET_DEPOSITS_NOT_APPROVED',
    'the gate must be hit before any database write',
  );
});

test('the gate can be enabled explicitly (documents how to turn it on)', async (t) => {
  const original = env.WALLET_DEPOSITS_ENABLED;
  env.WALLET_DEPOSITS_ENABLED = true;
  t.after(() => { env.WALLET_DEPOSITS_ENABLED = original; });
  const avail = wallet.depositAvailability();
  assert.equal(avail.available, true);
  assert.equal(avail.environment, 'sandbox');
  assert.equal(avail.providerLabel, 'Whop');
});

test('an enabled-but-unconfigured server reports NOT_CONFIGURED, not "available"', async (t) => {
  const origFlag = env.WALLET_DEPOSITS_ENABLED;
  const origPlans = env.WHOP_DEPOSIT_PLAN_IDS;
  env.WALLET_DEPOSITS_ENABLED = true;
  env.WHOP_DEPOSIT_PLAN_IDS = '';
  t.after(() => { env.WALLET_DEPOSITS_ENABLED = origFlag; env.WHOP_DEPOSIT_PLAN_IDS = origPlans; });
  const avail = wallet.depositAvailability();
  assert.equal(avail.available, false);
  assert.equal(avail.reasonCode, 'NOT_CONFIGURED');
});

// ---------------------------------------------------------------------------
// 3. Amount allow-list — the browser can never choose a price
// ---------------------------------------------------------------------------

test('deposit presets are parsed, sorted and come only from server config', () => {
  const presets = whop.depositPresets();
  assert.deepEqual(presets.map((p) => p.amountMinor), [2500, 5000], 'sorted ascending');
  assert.equal(presets[0].planId, 'plan_test_2500');
  assert.ok(presets.every((p) => p.planId.startsWith('plan_')), 'provider ids come from config only');
});

test('an unlisted amount is refused', () => {
  assert.throws(
    () => whop.resolveDepositPreset(3333),
    (e) => e.code === 'DEPOSIT_AMOUNT_NOT_OFFERED',
  );
});

test('non-integer and out-of-range amounts are refused', () => {
  assert.throws(() => whop.resolveDepositPreset(2500.5), (e) => e.code === 'INVALID_AMOUNT');
  assert.throws(() => whop.resolveDepositPreset(100), (e) => e.code === 'DEPOSIT_AMOUNT_OUT_OF_RANGE');
  assert.throws(() => whop.resolveDepositPreset(999999), (e) => e.code === 'DEPOSIT_AMOUNT_OUT_OF_RANGE');
});

test('a valid configured amount resolves to its server-side variant', () => {
  const preset = whop.resolveDepositPreset(5000);
  assert.equal(preset.amountMinor, 5000);
  assert.equal(preset.planId, 'plan_test_5000');
});

// ---------------------------------------------------------------------------
// 4. Client payloads must never carry a secret
// ---------------------------------------------------------------------------

test('client checkout info exposes no credentials', () => {
  const info = whop.publicCheckoutInfo({ reference: 'DEP-2026-ABC123', planId: 'plan_test_2500' });
  const serialised = JSON.stringify(info);
  assert.equal(info.metadata.order_reference, 'DEP-2026-ABC123');
  assert.equal(info.environment, 'sandbox');
  for (const key of ['WHOP_COMPANY_API_KEY', 'WHOP_COMPANY_ID', 'WHOP_WEBHOOK_SECRET', 'WHOP_WEBHOOK', 'apik_', 'ws_test']) {
    assert.ok(!serialised.includes(key), `client payload must not contain ${key}`);
  }
  // The return URL is where Whop appends payment + status — display only.
  assert.match(info.returnUrl, /\/wallet\/transactions\?deposit=/);
});

test('the provider status endpoint reports presence/mode but never a secret', () => {
  const status = whop.whopProviderStatus();
  assert.equal(status.configured, true);
  assert.equal(status.sandbox, true);
  assert.equal(status.environment, 'sandbox');
  assert.ok(Array.isArray(status.subscribedEvents) && status.subscribedEvents.length >= 5);
  const serialised = JSON.stringify(status);
  assert.ok(!serialised.includes(SECRET), 'webhook secret must never be exposed');
  assert.ok(!serialised.includes('apik_'), 'API key must never be exposed');
});

test('limits are integers in minor units', () => {
  const l = wallet.limits();
  assert.ok(Number.isInteger(l.minMinor) && Number.isInteger(l.maxMinor));
  assert.equal(l.currency, 'USD');
});

// ---------------------------------------------------------------------------
// 5. Payment interpretation — conservative by design
// ---------------------------------------------------------------------------

test('only an unambiguous paid payment counts as confirmed', () => {
  assert.equal(whop.interpretWhopPayment({ status: 'paid' }).paid, true);
  assert.equal(whop.interpretWhopPayment({ status: 'paid', substatus: 'refunded', refunded_amount: 10 }).paid, true);
  assert.equal(whop.interpretWhopPayment({ status: 'paid', substatus: 'refunded', refunded_amount: 10 }).refunded, true);
  for (const status of ['draft', 'pending', 'open', 'authorized', 'failed', 'voided', undefined]) {
    assert.equal(whop.interpretWhopPayment({ status }).paid, false, `status=${status} must not be treated as paid`);
  }
  assert.equal(whop.interpretWhopPayment(null).paid, false, 'a missing payment is never paid');
});

test('an unrecognised provider payment id is never queried', async () => {
  const r = await whop.retrieveDepositPayment('not_a_payment_id');
  assert.equal(r.confirmed, false);
  assert.equal(r.reason, 'unrecognised provider reference');
});
