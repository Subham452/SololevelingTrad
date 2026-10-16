import { useSyncExternalStore } from "react";

/**
 * Admin Control Center — "Neon Glow" display preference.
 *
 * A single browser-local boolean that drives the admin shell's decorative
 * illumination. Default is ON. Persisted in localStorage under an
 * admin-scoped key and shared across components/browsers tabs using the same
 * `useSyncExternalStore` + `storage` pattern as the watchlist store.
 *
 * Scope: this preference is consumed only by AdminLayout, which applies it to
 * the admin shell root as `data-glow="on" | "off"`. Nothing in the trader
 * dashboard or marketing site reads it, so enabling or disabling the effect
 * can never change those surfaces.
 *
 * No sensitive data is stored — only the literal "1"/"0" flag.
 */

const KEY = "slt_admin_glow";
const listeners = new Set();

let cache = null;
// Used when localStorage is unavailable (private mode / blocked storage): the
// choice is kept for the current session so the toggle still works, but it
// cannot survive a reload — which is the honest behaviour.
let sessionValue = null;

function read() {
  if (sessionValue !== null) return sessionValue;
  try {
    // Default ON: an unset key means "never chosen", not "off".
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true; // private mode / storage disabled — keep the intended default
  }
}

function emit() {
  cache = null;
  listeners.forEach((l) => l());
}

/** Current glow preference (defaults to true when never set). */
export function getGlow() {
  if (cache === null) cache = read();
  return cache;
}

/** Persist and broadcast the glow preference. */
export function setGlow(on) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
    sessionValue = null; // storage is authoritative again
  } catch {
    sessionValue = on; // storage unavailable — hold the choice for this session
  }
  emit();
}

export function toggleGlow() {
  setGlow(!getGlow());
}

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => {
    if (e.key === KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** React hook: current glow preference (stable boolean). */
export function useAdminGlow() {
  return useSyncExternalStore(subscribe, getGlow, getGlow);
}
