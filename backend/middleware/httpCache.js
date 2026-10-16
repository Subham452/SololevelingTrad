import crypto from 'crypto';
// HTTP cache headers: public CDN/browser caching + ETag 304 for cheap polls.
export function httpCache(seconds, { staleWhileRevalidate = 60 } = {}) {
  return (_req, res, next) => {
    res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${staleWhileRevalidate}`);
    const origJson = res.json.bind(res);
    res.json = (body) => {
      // Never let a failure be cached: a 429/5xx must not stick for `max-age`
      // (it would keep the client on the error even after the provider heals).
      if (res.statusCode >= 400) { res.setHeader('Cache-Control', 'no-store'); return origJson(body); }
      const tag = `"${crypto.createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16)}"`;
      res.setHeader('ETag', tag);
      return origJson(body);
    };
    next();
  };
}
