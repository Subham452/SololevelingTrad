import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { marketApi } from "./market.js";

/**
 * Client-side price alerts.
 *
 * Alerts are stored per browser (localStorage `slt_alerts`) and evaluated
 * against live market data from the app's own backend (CoinGecko proxy)
 * while SololevelingTrad is open. Nothing is fabricated: a trigger only
 * ever reports a real fetched price.
 *
 * Fired alerts surface in-app (window event `slt:alert-fired`) and via the
 * browser Notification API when the user has granted permission.
 */

const KEY = "slt_alerts";
const POLL_MS = 60e3;
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

export function getAlerts() {
  if (cache === null) cache = read();
  return cache;
}

function write(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  emit();
}

let seq = 0;
export function addAlert({ coinId, name, symbol, image, direction, price, note = "" }) {
  const alert = {
    id: `al_${Date.now().toString(36)}_${(seq++).toString(36)}`,
    coinId, name, symbol, image: image || null,
    direction, // "above" | "below"
    price: Number(price),
    note,
    enabled: true,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
    triggerPrice: null,
  };
  write([...getAlerts(), alert]);
  return alert;
}

export function updateAlert(id, patch) {
  write(getAlerts().map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function removeAlert(id) {
  write(getAlerts().filter((a) => a.id !== id));
}

/** Re-arm: clear trigger state and re-enable. */
export function rearmAlert(id) {
  updateAlert(id, { enabled: true, triggeredAt: null, triggerPrice: null });
}

export function clearTriggered() {
  write(getAlerts().filter((a) => !a.triggeredAt));
}

function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY) emit(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
}

export function useAlerts() {
  return useSyncExternalStore(subscribe, getAlerts, getAlerts);
}

/** Active = enabled and never triggered. */
export const activeAlerts = (alerts) => alerts.filter((a) => a.enabled && !a.triggeredAt);

export function alertHit(a, price) {
  if (price == null || Number.isNaN(Number(price))) return false;
  return a.direction === "above" ? price >= a.price : price <= a.price;
}

/** Check one fetched price against stored alerts; persist + broadcast triggers. */
export async function checkPrice(coinId, price) {
  const fired = getAlerts().filter((a) => a.coinId === coinId && a.enabled && !a.triggeredAt && alertHit(a, price));
  if (!fired.length) return [];
  const now = new Date().toISOString();
  write(getAlerts().map((a) => (fired.some((f) => f.id === a.id) ? { ...a, enabled: false, triggeredAt: now, triggerPrice: Number(price) } : a)));
  fired.forEach((a) => {
    const payload = { ...a, triggerPrice: Number(price), firedAt: now };
    window.dispatchEvent(new CustomEvent("slt:alert-fired", { detail: payload }));
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`Price alert · ${a.symbol}`, {
          body: `${a.name} is ${a.direction} ${a.price} — now $${Number(price).toLocaleString()}`,
        });
      }
    } catch { /* notification blocked */ }
  });
  return fired;
}

/**
 * Engine hook: polls live prices for every active alert (deduped per coin)
 * every 60s and fires real triggers. Mount once (app shell).
 */
export function useAlertsEngine() {
  const alerts = useAlerts();
  const alive = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const pending = activeAlerts(alerts);
    if (!pending.length) return undefined;
    let cancelled = false;

    const run = async () => {
      if (inFlight.current || cancelled || !alive.current) return;
      inFlight.current = true;
      const ids = [...new Set(pending.map((a) => a.coinId))];
      try {
        const results = await Promise.allSettled(ids.map((id) => marketApi.coin(id)));
        if (cancelled || !alive.current) return;
        results.forEach((r, i) => {
          if (r.status === "fulfilled" && r.value?.price != null) checkPrice(ids[i], r.value.price);
        });
      } catch { /* next poll retries */ }
      finally { inFlight.current = false; }
    };

    run();
    const iv = setInterval(run, POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [alerts]);
}

/**
 * In-app toast queue fed by the engine. Returns
 * { toasts, dismiss(id), requestPermission(), permission }.
 */
export function useAlertToasts() {
  const [toasts, setToasts] = useState([]);
  const [permission, setPermission] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));

  useEffect(() => {
    const onFire = (e) => {
      const a = e.detail;
      const tid = a.id + "-" + Date.now();
      setToasts((t) => [...t.slice(-3), { ...a, tid }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.tid !== tid)), 12e3);
    };
    window.addEventListener("slt:alert-fired", onFire);
    return () => window.removeEventListener("slt:alert-fired", onFire);
  }, []);

  const dismiss = (tid) => setToasts((t) => t.filter((x) => x.tid !== tid));
  const requestPermission = async () => {
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      return p;
    } catch { return "denied"; }
  };

  return { toasts, dismiss, requestPermission, permission };
}
