import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fmtUsd, fmtPct } from "../../lib/market.js";

// Map a performance percentage to a green/red neon tint. Saturates at ±8%.
function cellStyle(pct) {
  if (pct == null) return { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" };
  const mag = Math.min(Math.abs(pct) / 8, 1);
  const up = pct >= 0;
  const bg = up ? `rgba(16,185,129,${0.12 + mag * 0.5})` : `rgba(244,63,94,${0.12 + mag * 0.5})`;
  const fg = mag > 0.55 ? "#041016" : up ? "#6ee7b7" : "#fda4af";
  return { background: bg, color: fg };
}

/**
 * Heatmap — crypto performance tiles. Size (span) is driven by market cap so
 * bigger assets occupy more area; colors by 24h % change. Hover reveals stats.
 */
export default function Heatmap({ coins = [], field = "change24h", onCoinClick }) {
  const [hover, setHover] = useState(null);
  const rows = useMemo(() => {
    const withCap = coins.filter((c) => c.marketCap > 0);
    return withCap.sort((a, b) => b.marketCap - a.marketCap).slice(0, 24);
  }, [coins]);

  if (!rows.length) return <p className="py-10 text-center text-xs text-white/40">No market data for the heatmap.</p>;
  const maxCap = rows[0].marketCap;

  return (
    <div className="grid auto-rows-[64px] grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
      {rows.map((c, i) => {
        const pct = c[field];
        const span = c.marketCap / maxCap > 0.5 ? 2 : 1;
        const st = cellStyle(pct);
        return (
          <motion.button
            key={c.id} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}
            onClick={() => onCoinClick?.(c)}
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25 }}
            style={{ ...st, gridColumn: `span ${span}`, gridRow: `span ${span}` }}
            className="flex flex-col items-center justify-center rounded-lg p-1 text-center transition hover:z-10 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
            aria-label={`${c.name} ${fmtPct(pct)}`}
          >
            <span className="text-xs font-semibold leading-none">{c.symbol}</span>
            <span className="mt-0.5 text-[10px] tabular-nums opacity-90">{fmtPct(pct)}</span>
          </motion.button>
        );
      })}
      {hover && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-white/12 bg-black/90 px-4 py-2.5 text-xs backdrop-blur-md">
          <p className="font-medium text-white">{hover.name} <span className="text-white/40">{hover.symbol}</span></p>
          <p className="mt-0.5 tabular-nums text-white/60">{fmtUsd(hover.price)} · mcap {fmtUsd(hover.marketCap, 0)}</p>
        </div>
      )}
      <div className="col-span-full mt-2 flex items-center gap-2 text-[10px] text-white/35">
        <span>−8%</span>
        <span className="h-1.5 flex-1 rounded-full" style={{ background: "linear-gradient(90deg,#f43f5e,rgba(255,255,255,0.08),#10b981)" }} />
        <span>+8%</span>
        <span className="ml-2 text-white/25">size = market cap</span>
      </div>
    </div>
  );
}
