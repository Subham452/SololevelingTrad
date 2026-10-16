import test from 'node:test';
import assert from 'node:assert/strict';

// Deterministic secrets for the signed-quote tests (dotenv does not override an
// already-set process.env value).
process.env.JWT_ACCESS_SECRET = 'test-quote-secret';
process.env.QUOTE_TTL_SECONDS = '120';

const { signQuote, verifyQuote } = await import('../services/checkoutService.js');
const env = (await import('../config/env.js')).default;

test('signed quote round-trips and preserves server-computed identity fields', () => {
  const token = signQuote({ type: 'subscription', planSlug: 'pro', unitPriceCents: 5000, currency: 'USD' });
  const payload = verifyQuote(token);
  assert.equal(payload.type, 'subscription');
  assert.equal(payload.planSlug, 'pro');
  assert.equal(payload.unitPriceCents, 5000);
  assert.ok(payload.exp > payload.iat, 'quote carries an expiry');
});

test('a tampered quote payload is rejected (signature mismatch)', () => {
  const token = signQuote({ type: 'subscription', planSlug: 'starter', unitPriceCents: 2000 });
  const [, sig] = token.split('.');
  // Re-encode a doctored payload (cheap tier price edited to look free/pricier)
  // and reuse the original signature — must fail.
  const doctored = Buffer.from(JSON.stringify({ type: 'subscription', planSlug: 'ultimate', unitPriceCents: 1, v: 1, iat: Date.now(), exp: Date.now() + 1e6 }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.throws(() => verifyQuote(`${doctored}.${sig}`), /Invalid quote/);
});

test('a malformed quote token is rejected', () => {
  assert.throws(() => verifyQuote('not-a-token'), /Invalid quote/);
  assert.throws(() => verifyQuote(''), /Invalid quote/);
});

test('an expired quote is rejected with QUOTE_EXPIRED', () => {
  const originalTtl = env.QUOTE_TTL_SECONDS;
  try {
    env.QUOTE_TTL_SECONDS = -10; // issue a quote that is already expired
    const token = signQuote({ type: 'subscription', planSlug: 'pro', unitPriceCents: 5000 });
    assert.throws(() => verifyQuote(token), (e) => e.code === 'QUOTE_EXPIRED' && e.statusCode === 410);
  } finally {
    env.QUOTE_TTL_SECONDS = originalTtl;
  }
});
