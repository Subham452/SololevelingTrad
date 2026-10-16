import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, BellPlus, RefreshCw, Star } from "lucide-react";
import { fmtUsd, fmtPct, invalidateMarketCache } from "../lib/market.js";
import { useWatchlist, removeWatch, toggleWatch } from "../lib/watchlist.js";
import { useCoinPrices } from "../lib/useCoins.js";
import { Panel, Button, EmptyState, Badge } from "../components/ui.jsx";
import { cn } from "../lib/utils.js";
import { Sparkline } from "../components/Charts.jsx";
import CoinImg from "../components/app/CoinImg.jsx";
import StatusPill from "../components/app/StatusPill.jsx";
import AddAsset from "../components/app/AddAsset.jsx";

export default function Watchlist() {
  const watchIds = useWatchlist();
  const { byId, status, updatedAt, retry } = useCoinPrices(watchIds);
  const [sort, setSort] = useState({ key: "change24h", dir: -1 });

  const rows = useMemo(() => {
    const list = watchIds.map((id) => byId[id]).filter(Boolean);
    const v = (c, k) => c[k] ?? -Infinity;
    return [...list].sort((a, b) => (v(a, sort.key) - v(b, sort.key)) * sort.dir);
  }, [watchIds, byId, sort]);

  const loading = watchIds.length > 0 && rows.length === 0 && status !== "error";
  const failed = watchIds.length - rows.length;

  const th = (label, key) => (
    <button
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}
      className="inline-flex items-center gap-1 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
    >
      {label} <ArrowUpDown size={11} className={cn(sort.key === key && "text-cyan-400")} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-white">Watchlist</h2>
          <p className="mt-0.5 text-xs text-white/40">
            {watchIds.length} asset{watchIds.length === 1 ? "" : "s"} · saved on this device and synced across the app
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <AddAsset onSelect={(c) => toggleWatch(c.id)} selectedIds={watchIds} label="Add asset" />
          <button
            onClick={() => { invalidateMarketCache(); retry(); }} disabled={status === "loading"} aria-label="Refresh prices"
            className="rounded-full border border-white/10 p-2 text-white/60 transition hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(status === "loading" && "animate-spin")} />
          </button>
        </div>
      </div>

      <Panel bodyClassName={watchIds.length === 0 ? "p-0" : "p-0"} className="overflow-hidden">
        {watchIds.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Your watchlist is empty" className="border-0"
              copy="Star assets in Markets or add them with the button above. Your list persists on this device and follows you across the dashboard, markets and alerts."
              action={<Button to="/markets" size="sm" variant="secondary">Browse markets</Button>}
            />
          </div>
        ) : loading ? (
          <div className="space-y-2 p-5" aria-hidden>
            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Prices unavailable" className="border-0"
              copy="The market provider did not respond for your watched assets."
              action={<Button size="sm" variant="secondary" onClick={retry}>Retry</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-widest text-white/40">
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3 text-right">{th("Price", "price")}</th>
                  <th className="px-4 py-3 text-right">{th("24h", "change24h")}</th>
                  <th className="px-4 py-3 text-right">{th("7d", "change7d")}</th>
                  <th className="px-4 py-3 text-right">{th("Mkt cap", "marketCap")}</th>
                  <th className="px-4 py-3 text-right">Last 7d</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 transition hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5">
                      <Link to={`/markets/${encodeURIComponent(c.id)}`} className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
                        <CoinImg src={c.image} symbol={c.symbol} />
                        <span>
                          <span className="block font-medium text-white">{c.name}</span>
                          <span className="block text-[11px] uppercase text-white/40">{c.symbol}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="num px-4 py-2.5 text-right font-medium text-white">{c.price != null ? fmtUsd(c.price) : "—"}</td>
                    <td className={cn("num px-4 py-2.5 text-right", (c.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtPct(c.change24h)}</td>
                    <td className={cn("num px-4 py-2.5 text-right", (c.change7d ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtPct(c.change7d)}</td>
                    <td className="num px-4 py-2.5 text-right text-white/70">{fmtUsd(c.marketCap, 0)}</td>
                    <td className="px-4 py-2.5"><div className="flex justify-end"><Sparkline data={c.spark ?? []} change={c.change7d ?? 0} /></div></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/alerts?coin=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.name)}&symbol=${encodeURIComponent(c.symbol)}`}
                          aria-label={`Create price alert for ${c.name}`}
                          className="rounded-full p-1.5 text-white/35 transition hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                        >
                          <BellPlus size={15} />
                        </Link>
                        <button
                          onClick={() => removeWatch(c.id)} aria-label={`Remove ${c.name} from watchlist`}
                          className="rounded-full p-1.5 text-amber-400 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                        >
                          <Star size={15} fill="currentColor" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={status} updatedAt={updatedAt} onRetry={retry} />
        {failed > 0 && rows.length > 0 && <Badge tone="warning">{failed} asset{failed === 1 ? "" : "s"} could not be priced</Badge>}
        <p className="ml-auto text-[11px] text-white/35">Reference market data aggregated by CoinGecko — not executable quotes.</p>
      </div>
    </div>
  );
}
