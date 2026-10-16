import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingDown, TrendingUp, Volume2 } from "lucide-react";
import { fmtUsd, fmtPct } from "../../lib/market.js";
import { Sparkline } from "../Charts.jsx";
import CoinImg from "./CoinImg.jsx";
import StatusPill from "./StatusPill.jsx";
import { EmptyState, Segmented } from "../ui.jsx";
import { cn } from "../../lib/utils.js";

/**
 * Market activity feed built exclusively from real market data — the biggest
 * movers and most-traded assets in the fetched set, with source attribution.
 * No invented headlines: when there is nothing to show, it says so.
 */
export default function ActivityFeed({ coins, status = "loading", updatedAt, onRetry, limit = 6, source = "CoinGecko" }) {
  const [tab, setTab] = useState("gainers");

  const rows = useMemo(() => {
    const list = (coins || []).filter((c) => c?.id && c.price != null);
    const by24 = [...list].sort((a, b) => (b.change24h ?? -Infinity) - (a.change24h ?? -Infinity));
    if (tab === "gainers") return by24.slice(0, limit);
    if (tab === "losers") return by24.reverse().slice(0, limit);
    return [...list].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, limit);
  }, [coins, tab, limit]);

  const icons = { gainers: TrendingUp, losers: TrendingDown, volume: Volume2 };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Segmented
          ariaLabel="Activity filter" size="sm" value={tab} onChange={setTab}
          items={[
            { value: "gainers", label: "Top gainers" },
            { value: "losers", label: "Top losers" },
            { value: "volume", label: "Most traded" },
          ]}
        />
        <StatusPill status={status} updatedAt={updatedAt} onRetry={onRetry} compact />
      </div>

      {status === "loading" && !rows.length ? (
        <div className="space-y-2" aria-hidden>
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-11 rounded-lg" />)}
        </div>
      ) : status === "error" && !rows.length ? (
        <EmptyState title="Market activity unavailable" copy="The data provider did not respond. Retry in a moment." />
      ) : rows.length === 0 ? (
        <EmptyState title="No movement to show" copy="Once market data loads, real movers will appear here." />
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {rows.map((c) => {
            const Icon = icons[tab];
            return (
              <li key={c.id}>
                <Link
                  to={`/markets/${encodeURIComponent(c.id)}`}
                  className="group flex items-center gap-3 rounded-lg px-1 py-2.5 transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                >
                  <CoinImg src={c.image} symbol={c.symbol} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white group-hover:text-cyan-200">{c.name}</p>
                    <p className="text-[11px] uppercase tracking-wide text-white/35">{c.symbol}</p>
                  </div>
                  {tab === "volume" ? (
                    <span className="num hidden text-xs text-white/50 sm:block">{fmtUsd(c.volume24h, 0)}</span>
                  ) : (
                    <Sparkline data={c.sparkline ?? []} change={c.change24h ?? 0} width={72} height={24} />
                  )}
                  <div className="w-24 text-right sm:w-28">
                    <p className="num text-sm text-white">{fmtUsd(c.price)}</p>
                    <p className={cn("num flex items-center justify-end gap-1 text-[11px]", (c.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      <Icon size={11} /> {fmtPct(c.change24h)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-auto pt-3 text-[10px] uppercase tracking-wider text-white/25">
        Source: {source} via SololevelingTrad backend{updatedAt ? ` · updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
      </p>
    </div>
  );
}
