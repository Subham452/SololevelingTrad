import { memo, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";
import PriceChart from "../charts/PriceChart.jsx";
import { marketApi, fmtUsd, fmtPct } from "../../lib/market.js";
import { byId } from "./useMarketPoll.js";
import { cn } from "../../lib/utils.js";

const RANGES = ["1D", "1W", "1M"];
const PAIRS = [
  { id: "bitcoin", label: "BTC/USDT", to: "/trade/BTC-USDT" },
  { id: "ethereum", label: "ETH/USDT", to: "/trade/ETH-USDT" },
  { id: "solana", label: "SOL/USDT", to: "/trade/SOL-USDT" },
];

function Change({ value, className }) {
  const up = (value ?? 0) >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", up ? "text-emerald-400" : "text-red-400", className)}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
      {fmtPct(value)}
      <span className="sr-only">{up ? "up" : "down"}</span>
    </span>
  );
}

const FloatCard = memo(function FloatCard({ coin, to, className, delay }) {
  const reduce = useReducedMotion();
  if (!coin) return null;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className={cn("absolute z-20 hidden sm:block", className)}
    >
      <Link
        to={to}
        className="block rounded-2xl border border-white/10 bg-[#0D1220]/90 px-3.5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45">{coin.symbol}/USDT</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">{fmtUsd(coin.price)}</p>
        <Change value={coin.change24h} className="text-xs" />
      </Link>
    </motion.div>
  );
});

// Live hero terminal: real CoinGecko data via the backend proxy. Pair tabs,
// range tabs, area chart with volume, live/stale/error states, tiny ticker.
export default function HeroTerminal({ coins, updatedAt, status, onRetry }) {
  const reduce = useReducedMotion();
  const [pair, setPair] = useState(PAIRS[0]);
  const [range, setRange] = useState("1D");
  const [hist, setHist] = useState(null);
  const [histState, setHistState] = useState("loading");

  const coin = byId(coins, pair.id);

  useEffect(() => {
    let alive = true;
    marketApi
      .history(pair.id, range, "usd")
      .then((h) => {
        if (!alive) return;
        if (!h?.prices?.length) { setHistState("error"); return; }
        setHist(h);
        setHistState("ready");
      })
      .catch(() => { if (alive) setHistState("error"); });
    return () => { alive = false; };
  }, [pair.id, range]);

  const { series, volumes } = useMemo(() => {
    if (!hist?.prices?.length) return { series: [], volumes: [] };
    return {
      series: hist.prices.map(([t, p]) => ({ time: Math.floor(t / 1000), value: p })),
      volumes: (hist.volumes || []).map(([t, v]) => ({ time: Math.floor(t / 1000), value: v })),
    };
  }, [hist]);

  const live = status === "live";
  const stale = status === "stale";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25 }}
      className="relative"
    >
      {/* glow + floating cards */}
      <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(82,120,255,0.16),transparent)]" />
      <FloatCard coin={byId(coins, "ethereum")} to="/trade/ETH-USDT" delay={0.7} className="-left-6 top-10 lg:-left-14" />
      <FloatCard coin={byId(coins, "solana")} to="/trade/SOL-USDT" delay={0.85} className="-right-4 bottom-16 lg:-right-10" />

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0D1220]/80 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-4 py-3">
          <div className="flex gap-1" role="tablist" aria-label="Trading pair">
            {PAIRS.map((p) => (
              <button
                key={p.id} role="tab" aria-selected={pair.id === p.id}
                onClick={() => { setHistState("loading"); setPair(p); }}
                className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                  pair.id === p.id ? "bg-cyan-400/15 text-cyan-200" : "text-white/50 hover:text-white")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50" role="status">
              <span className={cn("h-1.5 w-1.5 rounded-full", live ? "animate-pulse bg-emerald-400" : stale ? "bg-amber-400" : "bg-red-400")} aria-hidden />
              {live ? "Live" : stale ? "Stale" : "Offline"}
            </span>
            <div className="flex gap-1" role="tablist" aria-label="Time range">
              {RANGES.map((r) => (
                <button
                  key={r} role="tab" aria-selected={range === r}
                  onClick={() => { setHistState("loading"); setRange(r); }}
                  className={cn("rounded-md px-2 py-1 text-[11px] tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                    range === r ? "bg-white/10 text-white" : "text-white/45 hover:text-white")}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* price row */}
        <div className="flex flex-wrap items-baseline gap-x-3 px-4 pt-3" aria-live="polite">
          {coin ? (
            <>
              <p className="text-2xl font-semibold tabular-nums text-white">{fmtUsd(coin.price)}</p>
              <Change value={coin.change24h} className="text-sm" />
              <p className="w-full text-[11px] tabular-nums text-white/35">
                24h change · {updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : "waiting for feed"} · CoinGecko
              </p>
            </>
          ) : (
            <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10" />
          )}
        </div>

        {/* chart */}
        <div className="px-2 pb-1">
          {histState === "ready" ? (
            <PriceChart mode="area" series={series} volumes={volumes} height={260} showGrid={false} />
          ) : histState === "error" ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-white/60">Chart unavailable — the data provider is rate-limited.</p>
              <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-xs text-white hover:bg-white/10">
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          ) : (
            <div className="h-[260px] animate-pulse rounded-xl bg-white/[0.03]" aria-label="Loading chart" />
          )}
        </div>

        {/* ticker strip */}
        <div className="flex items-center gap-4 overflow-x-auto border-t border-white/[0.07] px-4 py-2.5" aria-label="Top movers">
          {(coins || []).slice(0, 6).map((c) => (
            <Link key={c.id} to={`/markets/${encodeURIComponent(c.id)}`} className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-white/55 hover:text-white">
              <span className="font-semibold uppercase">{c.symbol}</span>
              <span>{fmtUsd(c.price, c.price < 10 ? 2 : 0)}</span>
              <Change value={c.change24h} />
            </Link>
          ))}
          {(!coins || !coins.length) && <span className="text-[11px] text-white/35">Waiting for market data…</span>}
        </div>
      </div>
    </motion.div>
  );
}
