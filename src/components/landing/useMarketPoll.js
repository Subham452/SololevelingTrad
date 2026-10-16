import { useEffect, useRef, useState } from "react";
import { marketApi } from "../../lib/market.js";

// Shared polling hook for landing market data. Single fetch, 60s refresh
// (inside CoinGecko rate limits), request dedup via the client's cache,
// full cleanup on unmount. Returns { coins, updatedAt, status, retry }.
export function useMarketPoll({ limit = 25 } = {}) {
  const [coins, setCoins] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | live | stale | error
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let staleTimer;
    setStatus((s) => (s === "live" ? "stale" : "loading"));
    // If the provider is slow, keep showing the last good frame with a stale flag.
    staleTimer = setTimeout(() => { if (alive.current) setStatus((s) => (s === "loading" ? s : "stale")); }, 8000);
    marketApi
      .coins({ page: 1, limit, currency: "usd" })
      .then((res) => {
        if (!alive.current) return;
        const list = res?.coins || [];
        if (!list.length) { setStatus("error"); return; }
        setCoins(list);
        setUpdatedAt(res?.updatedAt || new Date().toISOString());
        setStatus("live");
      })
      .catch(() => { if (alive.current) setStatus((s) => (s === "live" || coins ? "stale" : "error")); })
      .finally(() => clearTimeout(staleTimer));
    return () => { alive.current = false; clearTimeout(staleTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, limit]);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 60e3);
    return () => clearInterval(iv);
  }, []);

  return { coins, updatedAt, status, retry: () => setTick((t) => t + 1) };
}

export function byId(coins, id) {
  return (coins || []).find((c) => c.id === id) || null;
}
