import { useState } from "react";
import { Container, Section } from "../components/ui.jsx";
import { MarketChart, Sparkline } from "../components/Charts.jsx";
import { SignalCard } from "../components/Cards.jsx";
import { chartSeries, signals, instruments } from "../data/mockData.js";
export default function Terminal() {
  const [sym, setSym] = useState("NIFTY 50");
  const [watched, setWatched] = useState([1]);
  return <Section><Container>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">Terminal <span className="ml-2 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] text-green-400">LIVE DEMO</span></h1>
      <div className="flex gap-1.5 overflow-x-auto">
        {instruments.slice(0, 6).map((i) => (
          <button key={i.symbol} type="button" onClick={() => setSym(i.symbol)} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${sym === i.symbol ? "border-blue-500 bg-blue-600/20 text-white" : "border-white/15 text-white/50"}`}>{i.symbol}</button>
        ))}
      </div>
    </div>
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="glass rounded-2xl p-4">
        <div className="flex items-baseline justify-between"><h2 className="text-sm font-medium">{sym}</h2><p className="text-sm text-green-400">22,450.80 +1.24%</p></div>
        <div className="mt-2"><MarketChart data={chartSeries} height={300} /></div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/10 bg-transparent p-4">
          <h3 className="text-xs font-medium text-white/60">Watchlist</h3>
          {instruments.slice(0, 5).map((m) => (
            <div key={m.symbol} className="flex items-center justify-between py-1.5 text-xs"><span>{m.symbol}</span><Sparkline data={m.spark} change={m.change} width={64} height={20} /></div>
          ))}
        </div>
      </div>
    </div>
    <h3 className="mt-6 mb-3 text-sm font-medium text-white/70">Signal feed</h3>
    <div className="grid gap-4 md:grid-cols-2">
      {signals.map((s) => <SignalCard key={s.id} signal={s} watched={watched.includes(s.id)} onWatch={(id) => setWatched((w) => w.includes(id) ? w.filter((x) => x !== id) : [...w, id])} />)}
    </div>
  </Container></Section>;
}
