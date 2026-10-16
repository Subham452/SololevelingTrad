import env from '../config/env.js';
import { sanitize } from '../utils/sanitize.js';
import { logger } from '../utils/logger.js';
export function notFound(req, res) { res.status(404).json({ success: false, message: 'Not found' }); }
// A provider rate limit is an expected upstream condition, not an application
// error — logging it at ERROR level with a stack trace made a normal CoinGecko
// limit look like a crash. We emit one concise warning per 30s window instead.
let lastProviderLimitLogAt = 0;
function logProviderLimited(err, context) {
  const now = Date.now();
  if (now - lastProviderLimitLogAt < 30e3) return;
  lastProviderLimitLogAt = now;
  const retry = err.retryAfterSeconds ? `, retry in ~${err.retryAfterSeconds}s` : '';
  logger.warn(`provider rate-limited on ${context.path} — serving cached data${retry}`);
}
// eslint-disable-next-line
export function errorHandler(err, req, res, next) {
  const context = { requestId: req?.id, method: req?.method, path: req?.path };
  if (err?.code === 'PROVIDER_RATE_LIMITED') {
    logProviderLimited(err, context);
  } else {
    logger.error(env.NODE_ENV === 'production'
      ? JSON.stringify({ ...context, ...sanitize({ message: err.message, status: err.statusCode }) })
      : { ...context, err });
  }
  const status = err.statusCode || 500;
  const message = status === 500 && env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Error');
  // Lets standards-aware clients/proxies back off cleanly.
  if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
  res.status(status).json({
    success: false,
    message,
    code: err.code,
    errors: err.errors,
    // Lets clients back off cleanly (e.g. provider rate limits) instead of retry-hammering.
    ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
    requestId: req?.id,
  });
}
