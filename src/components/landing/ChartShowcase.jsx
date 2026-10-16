import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { marketApi } from "../../lib/market.js";
import PriceChart from "../charts/PriceChart.jsx";
import { Container, SectionHeading, Reveal, Badge } from "../ui.jsx";
import { cn } from "../../lib/utils.js";

// Chart intelligence showcase: real BTC candles/area with mode + range
// controls wired to the backend provider. No predictions, no signals.
const RANGES = ["1D", "1W", "1M"];
const MODES = [
  ["area", "Area"],
  ["candle", "Candles"],
];

export default function ChartShowcase() {
  const [range, setRange] = useState("1M");
  const [mode, setMode] = useState("area");
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let alive = true;
    const load = mode === "candle"
      ? marketApi.ohlc("bitcoin", range, "usd").then((r) => ({ candles: r?.candles || [] }))
      : marketApi.history("bitcoin", range, "usd").then((h) => ({ prices: h?.prices || [], volumes: h?.volumes || [] }));
    load.then((d) => {
      if (!alive) return;
      const empty = mode === "candle" ? !d.candles.length : !d.prices.length;
      if (empty) { setState("error"); return; }
      setData(d);
      setState("ready");
    }).catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [range, mode]);

  const { series, volumes, candles } = useMemo(() => {
    if (!data) return { series: [], volumes: [], candles: [] };
    return {
      series: (data.prices || []).map(([t, p]) => ({ time: Math.floor(t / 1000), value: p })),
      volumes: (data.volumes || []).map(([t, v]) => ({ time: Math.floor(t / 1000), value: v })),
      candles: data.candles || [],
    };
  }, [data]);

  return (
    <Container>
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <SectionHeading
            eyebrow="Chart intelligence"
            title="Charts that keep up with you"
            desc="Institutional-grade rendering with crosshair, volume, and real OHLC — the same engine that powers the terminal."
          />
          <ul className="space-y-2 text-sm text-white/60">
            {["Candles, area and OHLC modes", "Volume profile under every move", "Time ranges from 1D to ALL"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-cyan-300" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <Link to="/terminal" className="mt-5 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
            Open the terminal
          </Link>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="rounded-3xl border border-white/10 bg-[#0D1220]/70 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="accent">BTC/USDT · CoinGecko</Badge>
              <div className="ml-auto flex gap-1" role="tablist" aria-label="Chart mode">
                {MODES.map(([m, label]) => (
                  <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setState("loading"); setMode(m); }}
                    className={cn("rounded-md px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                      mode === m ? "bg-white/10 text-white" : "text-white/45 hover:text-white")}>{label}</button>
                ))}
              </div>
              <div className="flex gap-1" role="tablist" aria-label="Time range">
                {RANGES.map((r) => (
                  <button key={r} role="tab" aria-selected={range === r} onClick={() => { setState("loading"); setRange(r); }}
                    className={cn("rounded-md px-2.5 py-1 text-xs tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                      range === r ? "bg-white/10 text-white" : "text-white/45 hover:text-white")}>{r}</button>
                ))}
              </div>
            </div>
            {state === "ready" ? (
              <PriceChart mode={mode} series={series} volumes={volumes} candles={candles} height={340} />
            ) : state === "error" ? (
              <p className="flex h-[340px] items-center justify-center px-6 text-center text-sm text-white/50">
                Chart data is temporarily unavailable (provider rate limit). Try another range shortly.
              </p>
            ) : (
              <div className="h-[340px] animate-pulse rounded-xl bg-white/[0.03]" aria-label="Loading chart" />
            )}
          </div>
        </Reveal>
      </div>
    </Container>
  );
}
