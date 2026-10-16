import { Link } from "react-router-dom";
import { Star, TrendingUp } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Sparkline } from "./Charts.jsx";
import { Card, Badge, Button } from "./ui.jsx";

const toneColor = { bullish: "text-green-400 border-green-500/30 bg-green-500/10", bearish: "text-red-400 border-red-500/30 bg-red-500/10", neutral: "text-white/60 border-white/15 bg-white/5" };

export function SignalCard({ signal, onWatch = () => {}, watched = false }) {
  if (!signal) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Badge className={cn(toneColor[signal.tone] || toneColor.neutral)}>{signal.tag}</Badge>
        <span className="text-xs text-white/40">{signal.time}</span>
      </div>
      <h3 className="font-medium">{signal.title}</h3>
      <div className="flex items-center gap-2 text-xs text-white/60">
        <span className="inline-flex items-center gap-1"><TrendingUp size={12} /> Confidence {signal.confidence}%</span>
        <span>· {signal.momentum}</span><span>· {signal.volume}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-blue-500" style={{ width: `${signal.confidence}%` }} />
      </div>
      <p className="text-sm text-white/60">{signal.reasoning}</p>
      <div className="mt-auto flex gap-2 pt-1">
        <Button to="/signals" variant="ghost" className="px-4 py-2 text-xs">View Analysis</Button>
        <button type="button" onClick={() => onWatch(signal.id)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs transition", watched ? "border-green-500/40 text-green-400" : "border-white/15 text-white/70 hover:bg-white/5")}>
          <Star size={12} /> {watched ? "Watching" : "Add to Watchlist"}
        </button>
      </div>
      <p className="text-[11px] text-white/30">Not financial advice. For research and education only.</p>
    </Card>
  );
}

export function MetricCard({ label, value, delta, hint }) {
  const neg = typeof delta === "number" ? delta < 0 : String(delta || "").startsWith("-");
  return (
    <Card>
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {(delta || hint) && (
        <p className="mt-1 text-xs"><span className={neg ? "text-red-400" : "text-green-400"}>{delta}</span>{hint && <span className="text-white/40"> {hint}</span>}</p>
      )}
    </Card>
  );
}

// PricingCard removed: the public pricing page now renders plans fetched from
// the backend Plan catalogue (src/pages/Pricing.jsx). No hardcoded tiers here.

export function TestimonialCard({ t }) {
  return (
    <Card><p className="text-sm text-white/75">“{t.quote}”</p><p className="mt-4 text-sm font-medium">{t.name}</p><p className="text-xs text-white/40">{t.role}</p></Card>
  );
}

export function MarketCard({ instrument }) {
  const neg = instrument.change < 0;
  return (
    <Link to="/terminal" className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-transparent p-4 transition hover:border-white/20">
      <div>
        <p className="text-sm font-medium">{instrument.symbol}</p>
        <p className="mt-0.5 text-sm text-white/60">{instrument.price.toLocaleString("en-IN")} <span className={neg ? "text-red-400" : "text-green-400"}>({neg ? "" : "+"}{instrument.change}%)</span></p>
        <p className="text-[11px] text-white/30">Vol {instrument.volume}</p>
      </div>
      <Sparkline data={instrument.spark} change={instrument.change} />
    </Link>
  );
}
