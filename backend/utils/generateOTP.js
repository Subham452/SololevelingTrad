import crypto from 'crypto';
import env from '../config/env.js';

// OTP generation + hashing.
//
// A 6-digit code has only 1,000,000 possible values, so an unsalted SHA-256
// digest of it can be brute-forced offline in milliseconds if the database
// ever leaks. Codes are therefore hashed with HMAC-SHA256 using a server-side
// pepper (`OTP_HASH_SECRET`, never sent to clients). Without the pepper a
// stolen hash cannot be reversed, and the pepper is not stored alongside the
// digest. Verification stays constant-time to avoid leaking timing signal.
const pepper = () => String(env.OTP_HASH_SECRET || '');

export function generateOTP() { return String(crypto.randomInt(100000, 1000000)); }

export function hashOTP(otp, secret = pepper()) {
  return crypto.createHmac('sha256', String(secret)).update(String(otp)).digest('hex');
}

export function verifyOTPHash(otp, hash, secret = pepper()) {
  const h = hashOTP(otp, secret);
  const a = Buffer.from(h), b = Buffer.from(String(hash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
