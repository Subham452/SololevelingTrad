import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marketApi } from "./market.js";

/**
 * useCoinPrices(ids) — live prices for a specific set of coin IDs.
 *
 * Fetches each asset through the app's own backend (CoinGecko proxy; the
 * 30s client memo dedupes concurrent mounts) and re-polls every 60s.
 * Returns { byId, status, updatedAt, retry } — status: loading|live|stale|error.
 * Never fabricates data: missing assets simply stay absent.
 */
export function useCoinPrices(ids) {
  const key = useMemo(() => [...new Set((ids || []).filter(Boolean))].sort().join(","), [ids]);
  const list = useMemo(() => (key ? key.split(",") : []), [key]);
  const [byId, setById] = useState({});
  const [status, setStatus] = useState("loading");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!list.length) return undefined;
    let cancelled = false;
    setStatus((s) => (s === "live" ? "stale" : "loading"));

    const run = async () => {
      const rs = await Promise.allSettled(list.map((id) => marketApi.coin(id)));
      if (cancelled || !alive.current) return;
      let ok = 0;
      const next = {};
      rs.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value) { next[list[i]] = r.value; ok++; }
      });
      if (ok > 0) {
        setById((prev) => ({ ...prev, ...next }));
        setUpdatedAt(new Date().toISOString());
        setStatus("live");
      } else {
        setStatus((s) => (s === "live" ? "stale" : "error"));
      }
    };

    run();
    const iv = setInterval(run, 60e3);
    return () => { cancelled = true; clearInterval(iv); };
  }, [key, list, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { byId, status, updatedAt, retry };
}
