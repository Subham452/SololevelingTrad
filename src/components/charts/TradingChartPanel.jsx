import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { marketApi } from "../../lib/market.js";
import { loadChartPrefs, saveChartPrefs } from "../../lib/chartPrefs.js";
import { sma, ema, rsi, macd, bollinger, vwap } from "../../lib/indicators.js";
import PriceChart from "./PriceChart.jsx";
import ChartToolbar from "./ChartToolbar.jsx";
import { SkeletonLoader } from "../Loaders.jsx";
import { cn } from "../../lib/utils.js";

const fmtTime = (t) => new Date(t * 1000).toLocaleString();

/**
 * TradingChartPanel — fetches real CoinGecko OHLC + price/volume series,
 * computes indicators memoized, and renders the toolbar + chart + crosshair.
 * OHLC is only requested for candle mode and only real candles are drawn; if
 * the provider has no OHLC we fall back to the price series, never synthesized bars.
 */
function TradingChartPanel({ coinId, coin, height = 440 }) {
  const [range, setRange] = useState("1M");
  const [mode, setMode] = useState("candle");
  const [showGrid, setShowGrid] = useState(true);
  const [indicators, setIndicators] = useState({});
  const [crosshair, setCrosshair] = useState(null);
  const [data, setData] = useState(null);
  const [ohlc, setOhlc] = useState(null);
  const [err, setErr] = useState("");
  const seq = useRef(0);
  const fullRef = useRef(null);
  const prefsApplied = useRef(false);

  // Restore saved chart settings (Mongo) in parallel with the first fetch.
  // We still paint immediately with the default range; if the saved range
  // differs we switch after — cheap because of the client/backend caches.
  useEffect(() => {
    let live = true;
    loadChartPrefs().then((p) => {
      if (!live || !p || prefsApplied.current) return;
      prefsApplied.current = true;
      setRange(p.chartRange);
      setMode(p.chartMode);
      setShowGrid(p.chartShowGrid);
      setIndicators(Object.fromEntries(p.chartIndicators.map((i) => [i, true])));
    });
    return () => { live = false; };
  }, []);

  // Non-blocking load: paint the price series as soon as history resolves,
  // then fetch OHLC candles separately (only when in candle mode).
  const load = useCallback(async (id, r) => {
    if (!id) return;
    const my = ++seq.current;
    try {
      const h = await marketApi.history(id, r);
      if (seq.current !== my) return; // stale guard
      setErr(""); setData(h); setOhlc(null); // reset candles for new coin/range
    } catch {
      if (seq.current !== my) return;
      setErr("Chart data unavailable"); setData(null); setOhlc(null);
    }
  }, []);

  useEffect(() => { load(coinId, range); }, [coinId, range, load]);

  // Fetch candles only when actually needed. Runs after load() clears ohlc on
  // a range/coin change, so it refetches for the new range automatically.
  useEffect(() => {
    if (!coinId || mode !== "candle" || ohlc || !data) return;
    const my = seq.current;
    marketApi.ohlc(coinId, range)
      .then((c) => { if (seq.current === my) setOhlc(c); })
      .catch(() => { if (seq.current === my) setOhlc(null); });
  }, [coinId, mode, range, ohlc, data]);

  // --- aligned time series (seconds) ------------------------------------
  const points = useMemo(() => {
    if (!data?.prices?.length) return [];
    return data.prices.map(([t, p]) => ({ time: Math.floor(t / 1000), value: p }));
  }, [data]);

  const volumes = useMemo(() => {
    if (!data?.volumes?.length || !points.length) return null;
    // align volume to price timestamps by nearest preceding observation
    const vt = data.volumes.map(([t, v]) => [Math.floor(t / 1000), v]);
    let j = 0;
    return points.map((p) => {
      while (j + 1 < vt.length && vt[j + 1][0] <= p.time) j++;
      const v = vt[j]?.[1];
      return v != null ? { time: p.time, value: v, color: "rgba(99,102,241,0.28)" } : null;
    }).filter(Boolean);
  }, [data, points]);

  const candles = useMemo(() => (mode === "candle" && ohlc?.candles?.length ? ohlc.candles : null), [mode, ohlc]);

  // --- indicators (memoized on price+volume arrays) ----------------------
  const overlays = useMemo(() => {
    if (!points.length || !Object.keys(indicators).length) return [];
    const closes = points.map((p) => p.value);
    const vols = volumes?.map((v) => v.value) || null;
    const out = [];
    if (indicators.sma) out.push({ id: "sma", color: "#f59e0b", label: "SMA 20", values: sma(closes, 20) });
    if (indicators.ema) out.push({ id: "ema", color: "#22d3ee", label: "EMA 21", values: ema(closes, 21) });
    if (indicators.bb) {
      const b = bollinger(closes, 20, 2);
      out.push({ id: "bb-up", color: "#a78bfa", label: "BB upper", values: b.upper });
      out.push({ id: "bb-lo", color: "#a78bfa", label: "BB lower", values: b.lower });
    }
    if (indicators.vwap && vols) out.push({ id: "vwap", color: "#f472b6", label: "VWAP", values: vwap(closes, vols) });
    if (indicators.rsi) out.push({ id: "rsi", panel: "sub", color: "#c084fc", label: "RSI 14", lines: [{ color: "#c084fc", values: rsi(closes, 14) }], bands: [{ color: "rgba(148,163,184,0.3)", values: closes.map(() => 70) }, { color: "rgba(148,163,184,0.3)", values: closes.map(() => 30) }] });
    if (indicators.macd) {
      const m = macd(closes, 12, 26, 9);
      out.push({ id: "macd", panel: "sub", kind: "line", color: "#38bdf8", label: "MACD", lines: [{ color: "#38bdf8", values: m.line }, { color: "#f59e0b", values: m.signal }], });
    }
    return out;
  }, [points, indicators, volumes]);

  const legend = useMemo(() => overlays.filter((o) => !o.panel), [overlays]);
  // Handlers persist to Mongo (debounced). Guarded by getAccessToken() inside
  // saveChartPrefs, so public/anonymous views never fire auth'd requests.
  const toggleInd = (id) => setIndicators((p) => {
    const n = { ...p }; delete n[id]; if (!p[id]) n[id] = true;
    saveChartPrefs({ chartIndicators: Object.keys(n) });
    return n;
  });
  const handleRange = (r) => { setRange(r); saveChartPrefs({ chartRange: r }); };
  const handleMode = (m) => { setMode(m); saveChartPrefs({ chartMode: m }); };
  const handleGrid = () => setShowGrid((v) => { saveChartPrefs({ chartShowGrid: !v }); return !v; });
  const resetZoom = () => { /* chart fits content via internal ref */ };

  return (
    <motion.div
      ref={fullRef}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0714]/70 backdrop-blur-xl",
        "shadow-[0_0_50px_-25px_rgba(34,211,238,0.35)] transition-shadow hover:shadow-[0_0_60px_-20px_rgba(34,211,238,0.5)]"
      )}
    >
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-violet-600/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />

      <ChartToolbar
        coin={coin} price={data?.prices?.length ? data.prices[data.prices.length - 1][1] : null}
        change24h={coin?.change24h} range={range} onRange={handleRange}
        mode={mode} onMode={handleMode} indicators={indicators} onToggleIndicator={toggleInd}
        showGrid={showGrid} onToggleGrid={handleGrid}
        onFullscreen={() => { const el = fullRef.current; if (!document.fullscreenElement) el?.requestFullscreen?.(); else document.exitFullscreen?.(); }}
        onReset={resetZoom} source={data?.source} updatedAt={data?.updatedAt}
      />

      {legend.length > 0 && (
        <div className="flex flex-wrap gap-3 px-3 pt-2 text-[11px]">
          {legend.map((o) => (
            <span key={o.id} className="flex items-center gap-1.5 text-white/60">
              <span className="h-[2px] w-4 rounded-full" style={{ background: o.color }} />{o.label}
            </span>
          ))}
        </div>
      )}

      <div className="relative px-1 pb-1">
        {err ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-white/45">{err}</div>
        ) : !data ? (
          <div className="p-4"><SkeletonLoader rows={4} /></div>
        ) : !points.length ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-white/45">No data for this range.</div>
        ) : (
          <PriceChart
            mode={mode} candles={candles} series={points} volumes={volumes}
            overlays={overlays} showGrid={showGrid} height={height}
            onCrosshair={setCrosshair}
          />
        )}

        <AnimatePresence>
          {crosshair?.data && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
              className="pointer-events-none absolute right-3 top-3 z-20 rounded-xl border border-white/12 bg-black/85 px-3 py-2 text-[11px] backdrop-blur-md"
            >
              <p className="mb-1 text-white/45">{fmtTime(crosshair.time)}</p>
              {crosshair.data.open != null ? (
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
                  <span className="text-white/45">O</span><span className="text-white/85">{crosshair.data.open.toLocaleString()}</span>
                  <span className="text-white/45">H</span><span className="text-emerald-300">{crosshair.data.high.toLocaleString()}</span>
                  <span className="text-white/45">L</span><span className="text-rose-300">{crosshair.data.low.toLocaleString()}</span>
                  <span className="text-white/45">C</span><span className="text-white/85">{crosshair.data.close.toLocaleString()}</span>
                </div>
              ) : (
                <p className="tabular-nums text-cyan-200">${Number(crosshair.data.value).toLocaleString()}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default memo(TradingChartPanel);
