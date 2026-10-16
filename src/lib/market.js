import { api } from "./api.js";

// Market-data client — all values come from the backend provider service.
// Never synthesizes prices; errors propagate for honest UI states.
export const RANGES = ["1D", "1W", "1M", "6M", "1Y", "ALL"];

// ---- client-side memo cache ---------------------------------------------
// Short in-memory cache + in-flight dedup so revisiting a page (or a component
// remounting) paints instantly instead of re-hitting the network. Data is still
// real — it's just reused within a short window, then refetched.
const _cache = new Map(); // key -> { at, data }
const _inflight = new Map(); // key -> Promise
const CLIENT_TTL = 30e3; // reuse responses for 30s

function memo(key, ttl, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.data);
  if (_inflight.has(key)) return _inflight.get(key);
  const p = fn()
    .then((d) => { _cache.set(key, { at: Date.now(), data: d }); return d; })
    .finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}

// Force-refresh helper (pull-to-refresh buttons) — drops cached entries.
export function invalidateMarketCache(prefix = "") {
  for (const k of _cache.keys()) if (!prefix || k.startsWith(prefix)) { _cache.delete(k); }
}

export const marketApi = {
  overview: () => memo("overview", CLIENT_TTL, () => api.get("/market/overview")),
  coins: ({ page = 1, limit = 50, currency = "usd", provider } = {}) =>
    memo(`coins:${page}:${limit}:${currency}:${provider || ""}`, CLIENT_TTL,
      () => api.get(`/market/coins?page=${page}&limit=${limit}&currency=${currency}${provider ? `&provider=${provider}` : ""}`)),
  search: (q) => memo(`search:${q}`, 60e3, () => api.get(`/market/search?q=${encodeURIComponent(q)}`)),
  coin: (id) => memo(`coin:${id}`, CLIENT_TTL, () => api.get(`/market/coins/${encodeURIComponent(id)}`)),
  history: (id, range = "1M", currency = "usd") =>
    memo(`hist:${id}:${range}:${currency}`, CLIENT_TTL,
      () => api.get(`/market/coins/${encodeURIComponent(id)}/history?range=${range}&currency=${currency}`)),
  ohlc: (id, range = "1M", currency = "usd") =>
    memo(`ohlc:${id}:${range}:${currency}`, CLIENT_TTL,
      () => api.get(`/market/coins/${encodeURIComponent(id)}/ohlc?range=${range}&currency=${currency}`)),
  snapshot: (id, date) => api.get(`/market/coins/${encodeURIComponent(id)}/snapshot${date ? `?date=${date}` : ""}`),
};

// [timestamp, price] pairs -> recharts rows
export function toChartRows(history) {
  const prices = history?.prices || [];
  const vols = history?.volumes || [];
  return prices.map(([t, price], i) => ({
    t: new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    ts: t,
    price,
    vol: vols[i]?.[1] ?? null,
  }));
}

export function fmtUsd(n, digits = 2) {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: Math.abs(n) < 10 ? digits : 0 })}`;
}

export function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;
}
