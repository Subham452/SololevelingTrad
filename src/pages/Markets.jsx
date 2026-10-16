import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, BellPlus, RefreshCw, Star } from "lucide-react";
import { marketApi, fmtUsd, fmtPct, invalidateMarketCache } from "../lib/market.js";
import { Card, Badge, EmptyState, SectionHeading } from "../components/ui.jsx";
import { Sparkline } from "../components/Charts.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import CoinSearch from "../components/CoinSearch.jsx";
import Heatmap from "../components/charts/Heatmap.jsx";
import { useNavigate } from "react-router-dom";
import { useWatchlist, toggleWatch } from "../lib/watchlist.js";
import { cn } from "../lib/utils.js";

function CoinImg({ src, symbol }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">{String(symbol || "?").slice(0, 2)}</span>;
  return <img src={src} alt="" loading="lazy" className="h-7 w-7 rounded-full" onError={() => setErr(true)} />;
}

const PER_PAGE = 25;

export default function Markets() {
  const nav = useNavigate();
  const [coins, setCoins] = useState(null);
  const [overview, setOverview] = useState(null);
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useState("usd");
  const [sort, setSort] = useState({ key: "rank", dir: 1 });
  const [error, setError] = useState("");
  // Set when the provider (CoinGecko) is rate-limiting us: surfaced as a calm
  // "retrying shortly" notice instead of a red error card.
  const [limited, setLimited] = useState(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const favs = useWatchlist();

  const load = useCallback(async (p = page, cur = currency) => {
    setRefreshing(true); setError(""); setLimited(null);
    try {
      const [c, o] = await Promise.all([
        marketApi.coins({ page: p, limit: PER_PAGE, currency: cur }),
        p === 1 ? marketApi.overview().catch(() => null) : Promise.resolve(null),
      ]);
      setCoins(c?.coins || []);
      setUpdatedAt(c?.updatedAt || "");
      if (o) setOverview(o);
    } catch (e) {
      setError(e?.message || "Market data unavailable");
      // A provider rate limit is a "try again shortly", not a failure the user
      // did anything about — show it as an informational notice.
      const isLimited = e?.code === "PROVIDER_RATE_LIMITED" || e?.status === 429 || e?.status === 503;
      setLimited(isLimited ? (e?.retryAfterSeconds || 0) : null);
      // Keep whatever rows are already on screen. A transient refresh failure
      // must not blank a page the user was just reading; the error is surfaced
      // as a notice instead (see below), and the next poll self-heals.
      setCoins((prev) => prev ?? []);
    }
    finally { setRefreshing(false); }
  }, [page, currency]);

  useEffect(() => { setCoins(null); load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(), 120e3); // throttled refresh, reuse cache
    return () => clearInterval(t);
  }, [load]);

  const toggleFav = (id) => toggleWatch(id);

  const rows = useMemo(() => {
    if (!coins) return null;
    const v = (c, k) => c[k] ?? (k === "rank" ? 1e9 : 0);
    return [...coins].sort((a, b) => (v(a, sort.key) - v(b, sort.key)) * sort.dir);
  }, [coins, sort]);

  const th = (label, key) => (
    <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === "price" || key === "marketCap" ? -1 : 1 }))} className="inline-flex items-center gap-1 hover:text-white">
      {label} <ArrowUpDown size={11} className={cn(sort.key === key && "text-blue-400")} />
    </button>
  );

  return (
    <div className="space-y-4">
      <SectionHeading className="mb-2" eyebrow="MARKETS" title="Live crypto markets" copy="Real CoinGecko data via our backend — no invented prices." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <CoinSearch className="w-full sm:max-w-sm" />
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="flex rounded-full border border-white/10 p-0.5" role="group" aria-label="Currency">
            {(["usd", "inr"]).map((c) => (
              <button key={c} onClick={() => { setCurrency(c); setPage(1); }} aria-pressed={currency === c}
                className={cn("rounded-full px-3 py-1 text-xs uppercase", currency === c ? "bg-white text-black font-medium" : "text-white/60")}>{c}</button>
            ))}
          </div>
          <button onClick={() => { invalidateMarketCache(); load(); }} disabled={refreshing} aria-label="Refresh market data" className="rounded-full border border-white/10 p-2 text-white/60 hover:text-white disabled:opacity-50">
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {overview && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Total market cap", fmtUsd(overview.totalMarketCapUsd, 0)], ["24h volume", fmtUsd(overview.totalVolumeUsd, 0)], ["BTC dominance", overview.btcDominance != null ? `${overview.btcDominance.toFixed(1)}%` : "—"], ["Active assets", overview.activeCryptos?.toLocaleString() ?? "—"]].map(([t, v]) => (
            <Card key={t} className="bg-white/[0.02]"><p className="text-[11px] uppercase tracking-widest text-white/40">{t}</p><p className="mt-1 font-semibold tabular-nums text-white">{v}</p></Card>
          ))}
        </div>
      )}

      {coins && coins.length > 0 && (
        <Card className="mb-4 bg-white/[0.02] backdrop-blur-xl">
          <h2 className="mb-3 text-sm font-medium text-white">Market heatmap</h2>
          <Heatmap coins={coins} onCoinClick={(c) => nav(`/markets/${encodeURIComponent(c.id)}`)} />
        </Card>
      )}

      {error && rows && rows.length > 0 && (
        <p role="status" className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Showing the last loaded data — the latest refresh failed: {error}. Retrying automatically.
        </p>
      )}

      {limited != null && rows.length === 0 && (
        <p role="status" className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          Live market data is temporarily unavailable because the data provider is rate-limiting requests
          {limited ? ` (retrying automatically in ~${limited}s)` : " — retrying automatically"}.
        </p>
      )}

      {coins === null ? <SkeletonLoader rows={8} />
        : error && rows.length === 0 && limited == null ? <Card error={error} />
        : rows.length === 0 ? <EmptyState title="No market data" desc="The provider is unreachable or rate-limited. Please retry shortly." action={<button onClick={() => load()} className="rounded-full bg-white px-4 py-2 text-sm text-black">Retry</button>} />
        : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-widest text-white/40">
                  <th className="px-4 py-3">{th("#", "rank")}</th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3 text-right">{th("Price", "price")}</th>
                  <th className="px-4 py-3 text-right">1h</th>
                  <th className="px-4 py-3 text-right">24h</th>
                  <th className="px-4 py-3 text-right">7d</th>
                  <th className="px-4 py-3 text-right">{th("Mkt cap", "marketCap")}</th>
                  <th className="px-4 py-3 text-right">Last 7d</th>
                  <th className="px-4 py-3 text-right">Watch</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 transition hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5 tabular-nums text-white/40">{c.rank ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/markets/${encodeURIComponent(c.id)}`} className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        <CoinImg src={c.image} symbol={c.symbol} />
                        <span><span className="block font-medium text-white">{c.name}</span><span className="block text-[11px] uppercase text-white/40">{c.symbol}</span></span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-white">{currency === "inr" ? `₹${Number(c.price || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : fmtUsd(c.price)}</td>
                    {["change1h", "change24h", "change7d"].map((k) => (
                      <td key={k} className={cn("px-4 py-2.5 text-right tabular-nums", (c[k] ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>{fmtPct(c[k])}</td>
                    ))}
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/70">{fmtUsd(c.marketCap, 0)}</td>
                    <td className="px-4 py-2.5"><div className="flex justify-end"><Sparkline data={c.sparkline ?? []} change={c.change7d ?? 0} /></div></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Link
                          to={`/alerts?coin=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.name)}&symbol=${encodeURIComponent(c.symbol)}`}
                          aria-label={`Create price alert for ${c.name}`}
                          className="rounded-full p-1.5 text-white/30 transition hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                        >
                          <BellPlus size={14} />
                        </Link>
                        <button onClick={() => toggleFav(c.id)} aria-label={`${favs.includes(c.id) ? "Remove" : "Add"} ${c.name} ${favs.includes(c.id) ? "from" : "to"} watchlist`} aria-pressed={favs.includes(c.id)} className="rounded-full p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
                          <Star size={15} className={favs.includes(c.id) ? "fill-amber-400 text-amber-400" : "text-white/30 hover:text-white"} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-white/70 disabled:opacity-40">Prev</button>
          <span className="px-2 py-1.5 text-xs text-white/50">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-white/70">Next</button>
        </div>
        {updatedAt && <p className="ml-auto text-[11px] text-white/35">Updated {new Date(updatedAt).toLocaleString()} · <Badge>CoinGecko</Badge> · auto-refresh 2m</p>}
      </div>
      <p className="text-[11px] text-white/35">Reference market data only — not executable quotes. Starred assets are shared with your Watchlist, Dashboard and Alerts.</p>
    </div>
  );
}
