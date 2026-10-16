import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { marketApi, fmtUsd, fmtPct } from "../lib/market.js";
import { useMarketPoll } from "../components/landing/useMarketPoll.js";
import { Panel, Badge, EmptyState } from "../components/ui.jsx";
import { cn } from "../lib/utils.js";
import ActivityFeed from "../components/app/ActivityFeed.jsx";
import CoinImg from "../components/app/CoinImg.jsx";
import StatusPill from "../components/app/StatusPill.jsx";
import { Sparkline } from "../components/Charts.jsx";

/**
 * News & Activity — an honest market feed. No licensed news provider is
 * connected, so this page shows real market movement (movers, volume
 * leaders, global stats) sourced from CoinGecko via the app backend,
 * with attribution. It never invents headlines.
 */
export default function News() {
  const { coins, updatedAt, status, retry } = useMarketPoll({ limit: 100 });
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    let live = true;
    marketApi.overview()
      .then((o) => { if (live) setOverview(o); })
      .catch(() => { /* panel shows last state; poll retries */ });
    return () => { live = false; };
  }, []);

  const top = (coins || []).filter((c) => c?.id).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-white">News &amp; Activity</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-white/40">
            Real market movement, attributed to its source. SololevelingTrad does not pay for a licensed news wire,
            so this feed shows what actually happened in the market — not headlines.
          </p>
        </div>
        <StatusPill status={status} updatedAt={updatedAt} onRetry={retry} />
      </div>

      {overview && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Total market cap", fmtUsd(overview.totalMarketCapUsd, 0)],
            ["24h volume", fmtUsd(overview.totalVolumeUsd, 0)],
            ["BTC dominance", overview.btcDominance != null ? `${overview.btcDominance.toFixed(1)}%` : "—"],
            ["Active assets", overview.activeCryptos?.toLocaleString() ?? "—"],
          ].map(([t, v]) => (
            <div key={t} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-widest text-white/35">{t}</p>
              <p className="num mt-1 text-base font-semibold text-white">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Market movers" desc="Gainers, losers and most-traded — refreshed every 60 seconds">
            <ActivityFeed coins={coins} status={status} updatedAt={updatedAt} onRetry={retry} limit={12} />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Largest assets" desc="By market capitalisation">
            {status === "loading" && !top.length ? (
              <div className="space-y-2" aria-hidden>{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
            ) : top.length === 0 ? (
              <EmptyState title="Unavailable" copy="The market provider did not respond." />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {top.map((c) => (
                  <li key={c.id}>
                    <Link to={`/markets/${encodeURIComponent(c.id)}`} className="group flex items-center gap-2.5 py-2 transition hover:bg-white/[0.02]">
                      <CoinImg src={c.image} symbol={c.symbol} size="h-6 w-6" />
                      <span className="min-w-0 flex-1 truncate text-sm text-white/85 group-hover:text-cyan-200">{c.symbol.toUpperCase()}</span>
                      <Sparkline data={c.sparkline ?? []} change={c.change24h ?? 0} width={52} height={18} />
                      <div className="w-20 text-right">
                        <p className="num text-xs text-white">{fmtUsd(c.price)}</p>
                        <p className={cn("num text-[10px]", (c.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtPct(c.change24h)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="flex items-start gap-3 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.04] p-4">
            <Info size={15} className="mt-0.5 shrink-0 text-cyan-300" />
            <div className="text-xs leading-relaxed text-white/55">
              <p className="font-medium text-white/85">Where does this data come from?</p>
              <p className="mt-1">
                Prices and movement are aggregated by <Badge tone="accent" className="ml-0.5">CoinGecko</Badge> and served
                through the SololevelingTrad backend with caching. Nothing on this page is simulated or written by us.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
