import OTP from '../models/OTP.js';
import env from '../config/env.js';
import { generateOTP, hashOTP, verifyOTPHash } from '../utils/generateOTP.js';
export async function requestOTP(user, email) {
  const since = new Date(Date.now() - env.OTP_COOLDOWN_SECONDS * 1000);
  const recent = await OTP.findOne({ email, createdAt: { $gte: since } }).sort({ createdAt: -1 });
  if (recent) { const e = new Error('OTP cooldown: please wait before requesting again'); e.statusCode = 429; throw e; }
  await OTP.updateMany({ email, verified: false }, { $set: { verified: true } });
  const otp = generateOTP();
  await OTP.create({ userId: user?._id, email, otpHash: hashOTP(otp), expiresAt: new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60e3) });
  return otp;
}
export async function verifyOTP(email, otp) {
  const rec = await OTP.findOne({ email, verified: false }).sort({ createdAt: -1 });
  if (!rec) { const e = new Error('No OTP found'); e.statusCode = 400; throw e; }
  if (rec.expiresAt < new Date()) { const e = new Error('OTP expired'); e.statusCode = 400; throw e; }
  if (rec.attempts >= rec.maxAttempts) { const e = new Error('Too many attempts'); e.statusCode = 429; throw e; }
  if (!verifyOTPHash(String(otp), rec.otpHash)) { rec.attempts += 1; await rec.save(); const e = new Error('Invalid OTP'); e.statusCode = 400; throw e; }
  rec.verified = true; await rec.save(); return rec;
}
