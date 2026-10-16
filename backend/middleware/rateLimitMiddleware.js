import rateLimit from 'express-rate-limit';
const mk = (max, mins = 15) => rateLimit({ windowMs: mins * 60e3, max, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many requests' } });
export const generalLimiter = mk(300);
export const authLimiter = mk(30);
export const otpLimiter = mk(10, 60);
export const paymentLimiter = mk(30);
export const adminLimiter = mk(200);
// Unified checkout needs a split budget. Writes (quote / order / payment
// session) are intentionally strict because they touch money and providers;
// reads (config / history / status polling) must tolerate a result page
// polling every couple of seconds, so they get a much larger ceiling.
export const checkoutWriteLimiter = mk(60);
export const checkoutReadLimiter = mk(400);
// Wallet. Deposits are money-touching writes with a deliberately small budget
// (a user only submits a handful per session); reads carry the history view and
// a status poll, so they get room like the checkout reads do.
export const walletWriteLimiter = mk(20);
export const walletReadLimiter = mk(400);
