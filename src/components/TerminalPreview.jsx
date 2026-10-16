import { LayoutDashboard, Zap, LineChart, Star, PieChart, Radar, Settings } from "lucide-react";
import { MarketChart } from "./Charts.jsx";
import { chartSeries } from "../data/mockData.js";

const side = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Zap, label: "AI Signals" },
  { icon: LineChart, label: "Markets" },
  { icon: Star, label: "Watchlist" },
  { icon: PieChart, label: "Portfolio" },
  { icon: Radar, label: "Scanner" },
  { icon: Settings, label: "Settings" },
];

const intel = [
  { label: "Momentum", value: 78 },
  { label: "Trend", value: 64 },
  { label: "Volatility", value: 42 },
  { label: "AI Confidence", value: 87 },
];

export default function TerminalPreview() {
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-xs text-white/40">terminal — NIFTY 50 · live preview</span>
      </div>
      <div className="grid gap-0 lg:grid-cols-[180px_1fr_220px]">
        <aside className="hidden border-r border-white/10 p-3 lg:block">
          {side.map((s) => (
            <div key={s.label} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs ${s.active ? "bg-blue-600/15 text-white" : "text-white/50"}`}>
              <s.icon size={14} />{s.label}
            </div>
          ))}
        </aside>
        <div className="min-w-0 border-white/10 p-4 lg:border-r">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">NIFTY 50</h3>
            <p className="text-sm"><span className="font-semibold">22,450.80</span> <span className="text-green-400">+1.24%</span></p>
          </div>
          <div className="mt-2"><MarketChart data={chartSeries} height={220} /></div>
          <p className="mt-2 text-[11px] text-white/35">Support 22,300 · Resistance 22,560 · ▲ signal markers on breakout bars</p>
        </div>
        <aside className="border-t border-white/10 p-4 lg:border-t-0">
          <h4 className="text-xs font-medium text-white/60">Market Intelligence</h4>
          <div className="mt-3 flex flex-col gap-3">
            {intel.map((m) => (
              <div key={m.label}>
                <div className="mb-1 flex justify-between text-[11px] text-white/50"><span>{m.label}</span><span>{m.value}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-blue-500" style={{ width: `${m.value}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-[11px] text-white/60">
            AI view: structure favours continuation above 22,400 while volume holds.
          </div>
        </aside>
      </div>
    </div>
  );
}
