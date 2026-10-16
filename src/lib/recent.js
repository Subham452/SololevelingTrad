import { useSyncExternalStore } from "react";

/**
 * Recently-viewed coins (localStorage `slt_recent_coins`, max 8) — shared
 * by CoinSearch, CoinDetail and the dashboard. Written on every asset view.
 */

const KEY = "slt_recent_coins";
const MAX = 8;
const listeners = new Set();

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

let cache = null;
function emit() {
  cache = null;
  listeners.forEach((l) => l());
}

export function getRecent() {
  if (cache === null) cache = read();
  return cache;
}

/** Record a coin view: { id, name, symbol, image }. */
export function recordView(coin) {
  if (!coin?.id) return;
  const entry = { id: coin.id, name: coin.name, symbol: coin.symbol, image: coin.image };
  const cur = getRecent().filter((x) => x.id !== coin.id);
  const next = [entry, ...cur].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  emit();
}

export function clearRecent() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  emit();
}

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY) emit(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); }
}

export function useRecent() {
  return useSyncExternalStore(subscribe, getRecent, getRecent);
}
