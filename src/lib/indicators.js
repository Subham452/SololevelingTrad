// Technical indicator math. Pure functions over aligned [time, value] series.
// Each returns values aligned 1:1 with the input index (null until warm-up),
// so timestamps always match the price series — never re-indexed or invented.

const r4 = (n) => Math.round(n * 1e4) / 1e4;

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = r4(sum / period);
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  out[period - 1] = r4(seed / period);
  for (let i = period; i < values.length; i++) out[i] = r4(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

// Wilder's RSI
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / period, al = loss / period;
  out[period] = r4(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = r4(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const fastE = ema(values, fast), slowE = ema(values, slow);
  const line = values.map((_, i) => (fastE[i] != null && slowE[i] != null ? r4(fastE[i] - slowE[i]) : null));
  // Signal = EMA of the MACD line over its defined span only
  const defined = line.filter((v) => v != null);
  const sigDef = ema(defined, signal);
  let j = 0;
  const sig = line.map((v) => (v == null ? null : (sigDef[j++] ?? null)));
  const hist = line.map((v, i) => (v != null && sig[i] != null ? r4(v - sig[i]) : null));
  return { line, signal: sig, hist };
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sq / period);
    upper[i] = r4(mid[i] + mult * sd);
    lower[i] = r4(mid[i] - mult * sd);
  }
  return { mid, upper, lower };
}

// Volume-Weighted Average Price — only when real volume is present.
export function vwap(prices, volumes) {
  const out = new Array(prices.length).fill(null);
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < prices.length; i++) {
    const v = volumes?.[i];
    if (v == null || !(v > 0)) { out[i] = null; continue; } // skip gaps, don't fake
    cumPV += prices[i] * v;
    cumV += v;
    out[i] = r4(cumPV / cumV);
  }
  return out;
}

export const INDICATORS = {
  sma: { label: 'SMA', panel: 'price', defaults: { period: 20 }, color: '#f59e0b' },
  ema: { label: 'EMA', panel: 'price', defaults: { period: 21 }, color: '#22d3ee' },
  bb: { label: 'Bollinger', panel: 'price', defaults: { period: 20, mult: 2 }, color: '#a78bfa' },
  vwap: { label: 'VWAP', panel: 'price', defaults: {}, color: '#f472b6' },
  rsi: { label: 'RSI', panel: 'sub', defaults: { period: 14 }, color: '#c084fc' },
  macd: { label: 'MACD', panel: 'sub', defaults: { fast: 12, slow: 26, signal: 9 }, color: '#38bdf8' },
};
