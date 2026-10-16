import { useSyncExternalStore } from "react";

/**
 * Unified watchlist store (localStorage `slt_watch` — the same key the
 * Markets page has always used, so existing users keep their stars).
 * Single source of truth + subscription so Markets, Dashboard, Watchlist
 * and CoinDetail stay in sync across components and browser tabs.
 */

const KEY = "slt_watch";
const listeners = new Set();

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let cache = null;
function emit() {
  cache = null;
  listeners.forEach((l) => l());
}

export function getWatchlist() {
  if (cache === null) cache = read();
  return cache;
}

function write(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota/private mode */ }
  emit();
}

export function toggleWatch(id) {
  const cur = getWatchlist();
  write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
}

export function addWatch(id) {
  const cur = getWatchlist();
  if (!cur.includes(id)) write([...cur, id]);
}

export function removeWatch(id) {
  const cur = getWatchlist();
  if (cur.includes(id)) write(cur.filter((x) => x !== id));
}

export function isWatched(id) {
  return getWatchlist().includes(id);
}

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY) emit(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); }
}

/** React hook: current watchlist array (stable identity per change). */
export function useWatchlist() {
  return useSyncExternalStore(subscribe, getWatchlist, getWatchlist);
}

/** React hook: [isWatched(id), toggleWatch(id)] — memoized per id. */
export function useWatchToggle(id) {
  const list = useWatchlist();
  return [list.includes(id), () => toggleWatch(id)];
}
