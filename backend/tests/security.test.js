import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

// Security-focused unit tests for the hardening changes. These are pure and do
// not require a database.

const { generateOTP, hashOTP, verifyOTPHash } = await import('../utils/generateOTP.js');
const { paginate } = await import('../utils/sanitize.js');
const { can, PERMISSIONS } = await import('../middleware/permissions.js');
const { paymentMatchesPlan } = await import('../controllers/subscriptionController.js');

test('OTP hash is peppered (HMAC), not a bare SHA-256 digest', () => {
  const otp = '123456';
  const peppered = hashOTP(otp, 'server-pepper');
  const bare = crypto.createHash('sha256').update(otp).digest('hex');
  assert.notEqual(peppered, bare, 'a bare digest would be offline-brute-forceable');
  assert.ok(verifyOTPHash(otp, peppered, 'server-pepper'));
});

test('OTP hash round-trip is constant-time verified and rejects wrong codes/secrets', () => {
  const otp = generateOTP();
  assert.match(otp, /^\d{6}$/);
  const h = hashOTP(otp, 'pepper-a');
  assert.ok(verifyOTPHash(otp, h, 'pepper-a'));
  assert.ok(!verifyOTPHash('000000', h, 'pepper-a'), 'wrong code must fail');
  assert.ok(!verifyOTPHash(otp, h, 'pepper-b'), 'wrong pepper must fail');
});

test('paginate enforces sane, bounded page sizes', () => {
  assert.deepEqual(paginate({}), { page: 1, limit: 20, skip: 0 });
  assert.equal(paginate({ limit: '99999' }).limit, 100, 'limit is capped at 100');
  assert.equal(paginate({ limit: '-5' }).limit, 1);
  assert.equal(paginate({ page: '-3' }).page, 1);
  assert.equal(paginate({ page: '100000' }).page, 1000, 'page is bounded');
});

test('permission matrix: role writes are superadmin-only (no admin escalation)', () => {
  assert.equal(can('superadmin', 'roles:write'), true);
  assert.notEqual(can('admin', 'roles:write'), true, 'admins must not assign roles/superadmin');
  assert.notEqual(can('support', 'roles:write'), true);
  assert.equal(can('finance', 'finance:refund'), true);
  assert.notEqual(can('admin', 'settings:write'), true);
  // Every declared permission resolves to an array of known-ish roles.
  for (const [perm, roles] of Object.entries(PERMISSIONS)) {
    assert.ok(Array.isArray(roles) && roles.length > 0, `${perm} must grant at least one role`);
  }
});

test('payment/plan matching: a cheap payment cannot activate a higher tier', () => {
  assert.ok(paymentMatchesPlan('starter', 'starter'));
  assert.ok(paymentMatchesPlan('STARTER', 'Starter'), 'comparison is case-insensitive');
  assert.ok(paymentMatchesPlan('pro', 'pro'));
  assert.ok(!paymentMatchesPlan('starter', 'ultimate'), 'tier mismatch must be rejected');
  assert.ok(!paymentMatchesPlan('', 'pro'));
  assert.ok(!paymentMatchesPlan(null, 'pro'));
});
