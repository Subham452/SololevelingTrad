import crypto from 'crypto';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Request correlation + privacy-safe access logging.
//
// Every request gets a correlation id (from the caller's `X-Request-Id` header
// when present, otherwise generated) which is echoed back to the client and
// attached to the completion log. Logs deliberately exclude request bodies,
// query strings, cookies and authorization headers: only the method, the route
// path, the status code and the latency are recorded. No secrets, OTPs, tokens
// or PII can leak through the access log.
// ---------------------------------------------------------------------------
export function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && incoming.length <= 128 && incoming.trim()) || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const line = `${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms requestId=${id}`
      + (req.user?.sub ? ` userId=${req.user.sub}` : '')
      + (req.ip ? ` ip=${req.ip}` : '');
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.info(line);
  });
  next();
}

export default requestContext;
