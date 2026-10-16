import { motion } from "framer-motion";
import {
  CandlestickChart, AreaChart as AreaIcon, LineChart as LineIcon,
  Maximize2, Grid3x3, RotateCcw, Settings2, Activity, ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { RANGES } from "../../lib/market.js";
import { INDICATORS } from "../../lib/indicators.js";
import { cn } from "../../lib/utils.js";

const MODES = [
  { id: "candle", icon: CandlestickChart, label: "Candles" },
  { id: "area", icon: AreaIcon, label: "Area" },
  { id: "line", icon: LineIcon, label: "Line" },
];

function GlowBtn({ active, onClick, children, title, ...rest }) {
  return (
    <button
      onClick={onClick} title={title} aria-pressed={active} {...rest}
      className={cn(
        "relative rounded-lg px-2.5 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
        active ? "text-cyan-200" : "text-white/55 hover:text-white"
      )}
    >
      {active && (
        <motion.span
          layoutId="toolbar-glow"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="absolute inset-0 rounded-lg border border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_16px_-4px_rgba(34,211,238,0.7)]"
        />
      )}
      <span className="relative flex items-center gap-1.5">{children}</span>
    </button>
  );
}

export default function ChartToolbar({
  coin, price, change24h, range, onRange, mode, onMode,
  indicators, onToggleIndicator, showGrid, onToggleGrid,
  onFullscreen, onReset, source, updatedAt,
}) {
  const [openInd, setOpenInd] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-white/8 px-3 py-2">
      {coin && (
        <div className="flex items-center gap-2">
          {coin.image && <img src={coin.image} alt="" className="h-5 w-5 rounded-full" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
          <span className="text-sm font-semibold text-white">{coin.symbol}</span>
          {price != null && <span className="text-sm tabular-nums text-cyan-200">${Number(price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
          {change24h != null && (
            <span className={cn("text-xs tabular-nums", change24h >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {change24h >= 0 ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}%
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="Time range">
        {RANGES.map((r) => (
          <GlowBtn key={r} active={range === r} onClick={() => onRange(r)} title={`${r} range`} role="tab">{r}</GlowBtn>
        ))}
      </div>

      <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
        {MODES.map(({ id, icon: Icon, label }) => (
          <GlowBtn key={id} active={mode === id} onClick={() => onMode(id)} title={label}>
            <Icon size={14} />
          </GlowBtn>
        ))}
      </div>

      <div className="relative">
        <button
          onClick={() => setOpenInd((v) => !v)} aria-expanded={openInd} title="Indicators"
          className={cn("flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
            Object.keys(indicators).length ? "text-violet-300" : "text-white/55 hover:text-white")}
        >
          <Activity size={14} /> Indicators
          {Object.keys(indicators).length > 0 && (
            <span className="rounded-full bg-violet-500/30 px-1.5 text-[10px] text-violet-200">{Object.keys(indicators).length}</span>
          )}
          <ChevronDown size={12} className={cn("transition-transform", openInd && "rotate-180")} />
        </button>
        {openInd && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="absolute left-0 top-10 z-40 w-56 rounded-xl border border-white/10 bg-[#0d0a1a]/97 p-2 shadow-2xl backdrop-blur-xl"
          >
            {Object.entries(INDICATORS).map(([id, meta]) => (
              <label key={id} className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs text-white/75 hover:bg-white/5">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </span>
                <input type="checkbox" checked={!!indicators[id]} onChange={() => onToggleIndicator(id)} className="h-3.5 w-3.5 accent-cyan-500" aria-label={`Toggle ${meta.label}`} />
              </label>
            ))}
          </motion.div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {updatedAt && (
          <span className="hidden text-[10px] text-white/35 lg:inline">
            {source || "coingecko"} · {new Date(updatedAt).toLocaleTimeString()}
          </span>
        )}
        <GlowBtn active={showGrid} onClick={onToggleGrid} title="Toggle grid"><Grid3x3 size={14} /></GlowBtn>
        <GlowBtn onClick={onReset} title="Reset zoom"><RotateCcw size={14} /></GlowBtn>
        <GlowBtn onClick={onFullscreen} title="Fullscreen"><Maximize2 size={14} /></GlowBtn>
        <GlowBtn onClick={() => {}} title="Settings"><Settings2 size={14} /></GlowBtn>
      </div>
    </div>
  );
}
