// Market-data service: CoinGecko (free, no key) primary, CoinMarketCap optional.
// Never fabricates values — throws provider errors upstream for honest UI states.
// Perf: L1 (Map) + L2 (Redis) via cacheStore, keep-alive upstream sockets,
// SWR so hot polls never block on CoinGecko.
import { throughCache } from './cacheStore.js';
import http from 'http'; import https from 'https';

const CG = 'https://api.coingecko.com/api/v3';
const CMC = 'https://pro-api.coinmarketcap.com/v1';
const keepAlive = new https.Agent({ keepAlive: true, maxSockets: 20, maxFreeSockets: 10, timeout: 15000 });
const plainAgent = new http.Agent({ keepAlive: true, maxSockets: 20 });
const _fetch = globalThis.fetch;
const fastFetch = (url, init = {}) => _fetch(url, {
  ...init,
  dispatcher: undefined,
  // undici picks up global agent; force keep-alive via header + reuse
  headers: { Connection: 'keep-alive', ...init.headers },
});
void keepAlive; void plainAgent;
const TTL = { list: 120e3, coin: 120e3, chart: 90e3, search: 300e3 };
const STALE = 10 * 60e3; // serve stale up to 10 min while revalidating

const through = (key, ttl, fetcher) => throughCache(key, ttl, STALE, fetcher);

// ---------------------------------------------------------------------------
// Upstream rate-limit state (CoinGecko free tier).
// Once a 429 is seen we stop calling upstream until it is safe to retry, so a
// transient limit heals itself instead of being renewed by every poll.
// ---------------------------------------------------------------------------
let cgCooldownUntil = 0;
let cgStrikes = 0; // consecutive upstream 429s — drives the exponential backoff
const CG_BACKOFF_MAX_MS = 15 * 60e3;
/** True while we are deliberately not calling CoinGecko. */
export function cgRateLimited() { return Date.now() < cgCooldownUntil; }
/** Milliseconds until the next upstream call is allowed (0 = now). */
export function cgRetryInMs() { return Math.max(0, cgCooldownUntil - Date.now()); }

function rateLimitedError(until) {
  const secs = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  const err = new Error(
    `Market data provider is rate-limiting us right now. Showing the last known data; retrying automatically in ~${secs}s.`,
  );
  err.statusCode = 429;
  err.upstream = 429;
  err.provider = true;
  err.code = 'PROVIDER_RATE_LIMITED';
  err.retryAfterSeconds = secs;
  return err;
}

async function fetchJSON(url, { headers = {}, timeout = 12000 } = {}) {
  // Upstream rate-limit guard. CoinGecko's free tier (no key) allows only a
  // handful of calls per minute; without this the app keeps hammering it after
  // a 429, which keeps the limit exhausted and makes market data stay down.
  // While cooling down we fail FAST instead of calling upstream, so the stale
  // value already in cache keeps being served and the window can actually reset.
  const isCG = url.startsWith(CG);
  if (isCG && Date.now() < cgCooldownUntil) throw rateLimitedError(cgCooldownUntil);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    let r;
    try {
      r = await fastFetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
    } catch (e) {
      const err = new Error(e?.name === 'AbortError' ? 'Provider timeout' : 'Provider unreachable');
      err.statusCode = 502;
      err.provider = true;
      err.cause = e;
      throw err;
    }
    if (r.status === 429) {
      // Honour Retry-After, then back off exponentially on repeated hits. The
      // free tier limits by (shared) IP, so retrying at a fixed 60s just keeps
      // the window exhausted — waiting progressively longer lets it reset.
      const retryAfter = Number(r.headers.get('retry-after'));
      const baseSecs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
      cgStrikes = Math.min(cgStrikes + 1, 5);
      cgCooldownUntil = Date.now() + Math.min(baseSecs * 1000 * 2 ** (cgStrikes - 1), CG_BACKOFF_MAX_MS);
      await r.text().catch(() => null); // drain so the socket can be reused
      throw rateLimitedError(cgCooldownUntil);
    }
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      const err = new Error(body?.status?.error_message || `Provider error (${r.status})`);
      err.statusCode = r.status === 429 ? 429 : 502;
      err.upstream = r.status;
      err.provider = true;
      throw err;
    }
    cgStrikes = 0; // a good response resets the backoff
    return body;
  } finally { clearTimeout(t); }
}

const cgKey = () => process.env.COINGECKO_API_KEY || '';
const cmcKey = () => process.env.CMC_API_KEY || '';
const cgHeaders = () => (cgKey() ? { 'x-cg-demo-api-key': cgKey() } : {});

export function fmtRange(range) {
  const map = { '1D': 1, '1W': 7, '1M': 30, '6M': 180, '1Y': 365, ALL: 'max' };
  const days = map[String(range).toUpperCase()] ?? 30;
  return days;
}

// dd-mm-yyyy for CoinGecko /history snapshot endpoint
export function toCGDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

function normCoin(c) {
  return {
    id: c.id, symbol: String(c.symbol || '').toUpperCase(), name: c.name,
    image: c.image || null, rank: c.market_cap_rank ?? null,
    price: c.current_price ?? null, currency: 'usd',
    change1h: c.price_change_percentage_1h_in_currency ?? null,
    change24h: c.price_change_percentage_24h_in_currency ?? null,
    change7d: c.price_change_percentage_7d_in_currency ?? null,
    marketCap: c.market_cap ?? null, volume24h: c.total_volume ?? null,
    circulating: c.circulating_supply ?? null, maxSupply: c.max_supply ?? null,
    ath: c.ath ?? null, atl: c.atl ?? null, sparkline: c.sparkline?.price || null, updatedAt: c.last_updated || new Date().toISOString(),
    source: 'coingecko',
  };
}

export async function listCoins({ page = 1, perPage = 50, currency = 'usd' } = {}) {
  const key = `list:${currency}:${page}:${perPage}`;
  const url = `${CG}/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=${Math.min(perPage, 250)}&page=${page}&sparkline=true&price_change_percentage=1h,24h,7d`;
  return through(key, TTL.list, async () => {
    const data = await fetchJSON(url, { headers: cgHeaders() });
    return { coins: data.map(normCoin), source: 'coingecko', updatedAt: new Date().toISOString() };
  });
}

export async function searchCoins(q) {
  const key = `search:${q.toLowerCase()}`;
  return through(key, TTL.search, async () => {
    const data = await fetchJSON(`${CG}/search?query=${encodeURIComponent(q)}`, { headers: cgHeaders() });
    return { results: (data.coins || []).slice(0, 12).map((c) => ({ id: c.id, symbol: c.symbol, name: c.name, image: c.large || c.thumb })), source: 'coingecko' };
  });
}

export async function coinDetail(id) {
  const key = `coin:${id}`;
  return through(key, TTL.coin, async () => {
    const data = await fetchJSON(`${CG}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=true`, { headers: cgHeaders() });
    const md = data.market_data || {};
    return {
      id: data.id, symbol: String(data.symbol || '').toUpperCase(), name: data.name,
      image: data.image?.large || data.image?.small || null,
      description: String(data.description?.en || '').slice(0, 2000),
      rank: data.market_cap_rank ?? null,
      price: md.current_price?.usd ?? null, change24h: md.price_change_percentage_24h ?? null,
      change7d: md.price_change_percentage_7d ?? null,
      marketCap: md.market_cap?.usd ?? null, volume24h: md.total_volume?.usd ?? null,
      circulating: md.circulating_supply ?? null, maxSupply: md.max_supply ?? null,
      spark: data.market_data?.sparkline_7d?.price || null,
      source: 'coingecko', updatedAt: new Date().toISOString(),
    };
  });
}

// Time-series for charts. range: 1D|1W|1M|6M|1Y|ALL
// Note: CoinGecko public API caps history (~365d). ALL requests the full
// range but honestly reports `truncated: true` when the provider refuses.
export async function coinHistory(id, range = '1M', currency = 'usd') {
  const days = fmtRange(range);
  const key = `hist:${id}:${days}:${currency}`;
  return through(key, TTL.chart, async () => {
    const url = (d) => `${CG}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${currency}&days=${d}${d === 1 ? '&interval=hourly' : ''}`;
    let data, truncated = false;
    try {
      data = await fetchJSON(url(days), { headers: cgHeaders() });
    } catch (e) {
      if (days === 'max' && (e.upstream === 401 || e.statusCode === 429)) {
        data = await fetchJSON(url(365), { headers: cgHeaders() });
        truncated = true;
      } else throw e;
    }
    return { prices: data.prices || [], volumes: data.total_volumes || [], marketCaps: data.market_caps || [], range: String(range).toUpperCase(), truncated, rangeNote: truncated ? 'Provider free tier caps history at ~365 days' : null, source: 'coingecko', updatedAt: new Date().toISOString() };
  });
}

// Single-date snapshot (reference endpoint from spec)
export async function coinSnapshot(id, date /* Date */) {
  const d = toCGDate(date);
  const data = await fetchJSON(`${CG}/coins/${encodeURIComponent(id)}/history?date=${d}`, { headers: cgHeaders() });
  return { id, date: d, priceUsd: data.market_data?.current_price?.usd ?? null, marketCapUsd: data.market_data?.market_cap?.usd ?? null, volumeUsd: data.market_data?.total_volume?.usd ?? null, source: 'coingecko' };
}

// Real OHLC candles from CoinGecko's /ohlc feed. No volume here — the feed
// does not provide it, so we return `hasVolume:false` rather than inventing it.
const OHLC_DAYS = { '1D': 1, '1W': 7, '1M': 30, '6M': 90, '1Y': 180, 'ALL': 365 };
export async function coinOHLC(id, range = '1M', currency = 'usd') {
  const days = OHLC_DAYS[String(range).toUpperCase()] ?? 30;
  const key = `ohlc:${id}:${days}:${currency}`;
  return through(key, TTL.chart, async () => {
    const data = await fetchJSON(`${CG}/coins/${encodeURIComponent(id)}/ohlc?vs_currency=${currency}&days=${days}`, { headers: cgHeaders() });
    const candles = (data || []).map(([t, o, h, l, c]) => ({ time: t / 1000, open: o, high: h, low: l, close: c }));
    return { candles, range: String(range).toUpperCase(), hasVolume: false, source: 'coingecko', updatedAt: new Date().toISOString() };
  });
}

export async function marketOverview() {
  const key = 'overview';
  return through(key, TTL.list, async () => {
    const data = await fetchJSON(`${CG}/global`, { headers: cgHeaders() }).catch(() => null);
    if (!data?.data) { const err = new Error('Market overview unavailable'); err.statusCode = 502; throw err; }
    const d = data.data;
    return {
      totalMarketCapUsd: d.total_market_cap?.usd ?? null, totalVolumeUsd: d.total_volume?.usd ?? null,
      btcDominance: d.market_cap_percentage?.btc ?? null, ethDominance: d.market_cap_percentage?.eth ?? null,
      activeCryptos: d.active_cryptocurrencies ?? null, updatedAt: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : new Date().toISOString(),
      source: 'coingecko',
    };
  });
}

// CoinMarketCap listings (requires CMC_API_KEY). Normalized to same shape.
export async function cmcListings({ limit = 50, convert = 'USD' } = {}) {
  if (!cmcKey()) { const e = new Error('CMC_API_KEY not configured'); e.statusCode = 503; throw e; }
  const data = await fetchJSON(`${CMC}/cryptocurrency/listings/latest?limit=${Math.min(limit, 200)}&convert=${convert}`, { headers: { 'X-CMC_PRO_API_KEY': cmcKey() } });
  const coins = (data.data || []).map((c) => {
    const q = c.quote?.[convert] || {};
    return { id: `cmc-${c.id}`, cmcId: c.id, slug: c.slug, symbol: c.symbol, name: c.name, rank: c.cmc_rank ?? null, price: q.price ?? null, change1h: q.percent_change_1h ?? null, change24h: q.percent_change_24h ?? null, change7d: q.percent_change_7d ?? null, marketCap: q.market_cap ?? null, volume24h: q.volume_24h ?? null, circulating: c.circulating_supply ?? null, maxSupply: c.max_supply ?? null, updatedAt: q.last_updated || new Date().toISOString(), source: 'coinmarketcap' };
  });
  return { coins, source: 'coinmarketcap', updatedAt: new Date().toISOString() };
}
