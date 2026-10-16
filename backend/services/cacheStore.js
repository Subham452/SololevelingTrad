import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// L1: in-process Map (µs). L2: Redis shared across instances (ms).
// If REDIS_URL unset, degrades to L1-only — zero ops burden.
//
// Entries are retained for `ttlMs` (fresh window) PLUS `STALE_MS` (grace
// window). Within the grace window `throughCache` serves the last good value
// marked `stale` instead of erroring — this is what keeps market data on
// screen while the upstream provider is rate-limited or down. After the grace
// window the entry is dropped so we never show arbitrarily old data.
const L1 = new Map();
const MAX_L1 = 500;
export const STALE_MS = 10 * 60e3;
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableReadyCheck: true });
  redis.connect().catch((e) => logger.warn('Redis unavailable, L1-only: ' + e.message));
  redis.on('error', (e) => logger.warn('Redis error: ' + e.message));
}
const getL1 = (k) => {
  const e = L1.get(k);
  if (!e) return null;
  if (Date.now() > e.staleExp) { L1.delete(k); return null; } // kept past ttl, dropped after grace
  return e;
};
// `knownAt` preserves the original fetch time when promoting an L2 value into
// L1 — without it a promoted entry would look brand new and mask real staleness.
const setL1 = (k, data, ttlMs, knownAt) => {
  if (L1.size >= MAX_L1) L1.delete(L1.keys().next().value);
  const at = knownAt ?? Date.now();
  L1.set(k, { at, exp: at + ttlMs, staleExp: at + ttlMs + STALE_MS, data });
};

export async function cacheGet(key) {
  const hit = getL1(key);
  if (hit) return { at: hit.at, exp: hit.exp, data: hit.data, tier: 'L1' };
  if (!redis) return null;
  try {
    const raw = await redis.get(`slt:${key}`);
    if (!raw) return null;
    const { at, data, ttl } = JSON.parse(raw);
    setL1(key, data, ttl, at);
    return { at, exp: at + ttl, data, tier: 'L2' };
  } catch { return null; }
}

export async function cacheSet(key, data, ttlMs) {
  setL1(key, data, ttlMs);
  if (!redis) return;
  // Keep the L2 copy for the same ttl+grace as L1 so a restart mid-outage
  // still has something to serve instead of going blank.
  const ttlWithGrace = Math.ceil((ttlMs + STALE_MS) / 1000);
  try { await redis.setex(`slt:${key}`, ttlWithGrace, JSON.stringify({ at: Date.now(), data, ttl: ttlMs })); } catch { /* L1 suffices */ }
}

// SWR + single-flight: fresh→instant, stale→instant + bg refresh, miss→coalesced fetch.
// `staleMs` is the grace window: entries older than ttl but younger than
// ttl+staleMs are still served (marked `stale`) so a provider outage or
// rate-limit window never blanks the UI. Older entries are treated as a miss.
const pending = new Map();
export function throughCache(key, ttlMs, staleMs, fetcher) {
  const run = async () => {
    const d = await fetcher();
    await cacheSet(key, d, ttlMs);
    return d;
  };
  return (async () => {
    const entry = await cacheGet(key);
    const age = entry ? Date.now() - entry.at : Infinity;
    if (entry && age < ttlMs) return { ...entry.data, cached: true, tier: entry.tier };
    if (entry && age < ttlMs + staleMs) { // stale: serve now, refresh in bg
      if (!pending.has(key)) {
        // A failed refresh (rate limit, timeout) keeps the stale value on
        // screen rather than surfacing an error the user can't act on.
        const p = run().catch(() => entry.data).finally(() => pending.delete(key));
        pending.set(key, p); p.catch(() => {});
      }
      return { ...entry.data, cached: true, stale: true, tier: entry.tier };
    }
    if (pending.has(key)) return { ...(await pending.get(key)), cached: true };
    const p = run().finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  })();
}

export function cacheStats() { return { l1Size: L1.size, redis: redis ? redis.status : 'disabled' }; }
