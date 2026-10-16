import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BellPlus, Star } from "lucide-react";
import { marketApi, fmtUsd, fmtPct } from "../lib/market.js";
import { Container, Section, Card, Badge, EmptyState } from "../components/ui.jsx";
import { cn } from "../lib/utils.js";
import TradingChartPanel from "../components/charts/TradingChartPanel.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import { useWatchlist, toggleWatch } from "../lib/watchlist.js";
import { recordView } from "../lib/recent.js";

function CoinImg({ src, symbol, size = "h-10 w-10" }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <span className={cn("flex items-center justify-center rounded-full bg-white/10 text-xs font-bold", size)}>{String(symbol || "?").slice(0, 2)}</span>;
  return <img src={src} alt="" className={cn("rounded-full", size)} onError={() => setErr(true)} />;
}

export default function CoinDetail() {
  const { id } = useParams();
  const watchIds = useWatchlist();
  const [coin, setCoin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    marketApi.coin(id).then((d) => { if (live) { setCoin(d); setLoading(false); if (d) recordView(d); } })
      .catch((e) => { if (live) { setError(e?.message || "Failed to load asset"); setLoading(false); } });
    return () => { live = false; };
  }, [id]);

  const watched = watchIds.includes(id);

  return (
    <Section><Container>
      <Link to="/markets" className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white"><ArrowLeft size={14} /> Back to markets</Link>
      {loading && <div className="mt-4"><SkeletonLoader rows={4} /></div>}
      {(!loading && error) && <Card error={error} className="mt-4" />}
      {(!loading && !error && !coin) && <div className="mt-4"><EmptyState title="Asset not found" desc="The provider has no record for this ID." /></div>}
      {(!loading && !error && coin) && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <CoinImg src={coin.image} symbol={coin.symbol} />
              <div>
                <h1 className="text-xl font-semibold text-white">{coin.name} <span className="text-sm text-white/40">{coin.symbol}</span></h1>
                <p className="text-xs text-white/40">Rank #{coin.rank ?? "—"} · CoinGecko ID <span className="font-mono">{coin.id}</span></p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Link
                  to={`/alerts?coin=${encodeURIComponent(coin.id)}&name=${encodeURIComponent(coin.name)}&symbol=${encodeURIComponent(coin.symbol)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition hover:border-cyan-500/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                >
                  <BellPlus size={13} /> Set alert
                </Link>
                <button
                  onClick={() => toggleWatch(coin.id)} aria-pressed={watched}
                  aria-label={watched ? `Remove ${coin.name} from watchlist` : `Add ${coin.name} to watchlist`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                    watched ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white"
                  )}
                >
                  <Star size={13} fill={watched ? "currentColor" : "none"} /> {watched ? "Watching" : "Watch"}
                </button>
              </div>
              <div className="w-full text-right sm:ml-auto sm:w-auto">
                <p className="num text-2xl font-semibold text-white">{fmtUsd(coin.price)}</p>
                <p className={cn("num text-sm", (coin.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtPct(coin.change24h)} <span className="text-white/40">24h</span> · {fmtPct(coin.change7d)} <span className="text-white/40">7d</span></p>
              </div>
            </div>
            <TradingChartPanel coinId={coin.id} coin={coin} height={440} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Market cap", fmtUsd(coin.marketCap, 0)], ["24h volume", fmtUsd(coin.volume24h, 0)], ["Circulating", coin.circulating ? coin.circulating.toLocaleString() : "—"], ["Max supply", coin.maxSupply ? coin.maxSupply.toLocaleString() : "—"]].map(([t, v]) => (
                <Card key={t} className="bg-white/[0.02]"><p className="text-xs uppercase tracking-widest text-white/40">{t}</p><p className="mt-1 font-semibold tabular-nums text-white">{v}</p></Card>
              ))}
            </div>
            {coin.description && <Card className="bg-white/[0.02]"><h2 className="text-sm font-medium text-white">About {coin.name}</h2><p className="mt-2 text-sm leading-relaxed text-white/60">{coin.description}</p></Card>}
            <p className="text-[11px] text-white/35">Market data only — prices are aggregated reference data, not executable quotes. <Badge tone="warning">Not financial advice</Badge></p>
          </div>)}
    </Container></Section>
  );
}
