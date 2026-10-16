import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BellPlus, Check, SlidersHorizontal, Sparkles, Star } from "lucide-react";
import { marketApi, fmtUsd, fmtPct } from "../lib/market.js";
import { tradingApi } from "../lib/trading.js";
import { useWatchlist, toggleWatch, removeWatch } from "../lib/watchlist.js";
import { useRecent, clearRecent } from "../lib/recent.js";
import { useAlerts } from "../lib/alerts.js";
import { useCoinPrices } from "../lib/useCoins.js";
import { useMarketPoll } from "../components/landing/useMarketPoll.js";
import { useAuth } from "../context/useAuth.js";
import { Panel, Button, Badge, EmptyState } from "../components/ui.jsx";
import { cn } from "../lib/utils.js";
import { Sparkline } from "../components/Charts.jsx";
import TradingChartPanel from "../components/charts/TradingChartPanel.jsx";
import CoinImg from "../components/app/CoinImg.jsx";
import StatusPill from "../components/app/StatusPill.jsx";
import ActivityFeed from "../components/app/ActivityFeed.jsx";
import AddAsset from "../components/app/AddAsset.jsx";

const MAJORS = ["bitcoin", "ethereum", "solana"];
const TODAY_LABEL = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
const PANEL_KEY = "slt_dash_panels";
const CHART_COIN_KEY = "slt_dash_coin";
const PANEL_DEFS = [
  { key: "chart", label: "Primary chart" },
  { key: "stats", label: "Market stats" },
  { key: "watchlist", label: "Watchlist" },
  { key: "recent", label: "Recently viewed" },
  { key: "portfolio", label: "Portfolio snapshot" },
  { key: "activity", label: "Market activity" },
];

function loadPanels() {
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_KEY) || "{}");
    return Object.fromEntries(PANEL_DEFS.map((p) => [p.key, saved[p.key] !== false]));
  } catch {
    return Object.fromEntries(PANEL_DEFS.map((p) => [p.key, true]));
  }
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const { user, authenticated } = useAuth();
  const watchIds = useWatchlist();
  const recent = useRecent();
  const alerts = useAlerts();

  const [panels, setPanels] = useState(loadPanels);
  const [customize, setCustomize] = useState(false);
  const [onboardDone, setOnboardDone] = useState(() => {
    try { return localStorage.getItem("slt_onboard_done") === "1"; } catch { return false; }
  });
  const [chartCoin, setChartCoin] = useState(() => {
    try { return localStorage.getItem(CHART_COIN_KEY) || "bitcoin"; } catch { return "bitcoin"; }
  });
  const [overview, setOverview] = useState(null);
  const [ovStatus, setOvStatus] = useState("loading");
  const [ovTick, setOvTick] = useState(0);
  const [portfolio, setPortfolio] = useState(null);
  const [pfStatus, setPfStatus] = useState(authenticated ? "loading" : "off");
  const [pfTick, setPfTick] = useState(0);

  const { coins, updatedAt, status, retry } = useMarketPoll({ limit: 100 });

  // One price stream for every asset this page shows.
  const priceIds = useMemo(() => {
    const set = new Set([...MAJORS, chartCoin, ...watchIds, ...recent.map((r) => r.id)]);
    return [...set];
  }, [chartCoin, watchIds, recent]);
  const { byId, status: priceStatus, updatedAt: priceUpdated, retry: retryPrices } = useCoinPrices(priceIds);

  const chips = useMemo(() => {
    const extras = watchIds.filter((id) => !MAJORS.includes(id) && id !== chartCoin);
    return [chartCoin, ...MAJORS.filter((id) => id !== chartCoin), ...extras.filter((id) => !MAJORS.includes(id))].slice(0, 8);
  }, [chartCoin, watchIds]);

  const setPanel = (key, on) => {
    setPanels((p) => {
      const next = { ...p, [key]: on };
      try { localStorage.setItem(PANEL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    let live = true;
    setOvStatus((s) => (s === "live" ? "stale" : "loading"));
    marketApi.overview()
      .then((o) => { if (live) { setOverview(o); setOvStatus("live"); } })
      .catch(() => { if (live) setOvStatus((s) => (s === "live" ? "stale" : "error")); });
    return () => { live = false; };
  }, [ovTick]);

  useEffect(() => {
    if (!authenticated) return undefined;
    let live = true;
    setPfStatus((s) => (s === "live" ? "stale" : "loading"));
    tradingApi.portfolio()
      .then((p) => { if (live) { setPortfolio(p); setPfStatus("live"); } })
      .catch(() => { if (live) setPfStatus((s) => (s === "live" ? "stale" : "error")); });
    return () => { live = false; };
  }, [authenticated, pfTick]);

  const pickChart = (id) => { setChartCoin(id); try { localStorage.setItem(CHART_COIN_KEY, id); } catch { /* ignore */ } };
  const dismissOnboard = () => { setOnboardDone(true); try { localStorage.setItem("slt_onboard_done", "1"); } catch { /* ignore */ } };
  const showOnboard = !onboardDone && watchIds.length === 0 && alerts.length === 0;

  const name = user?.firstName || (user?.name ? String(user.name).split(" ")[0] : null);
  const today = TODAY_LABEL;
  const greet = useMemo(() => greeting(), []);
  const tickerIds = useMemo(() => [...new Set([...MAJORS, ...watchIds])].slice(0, 8), [watchIds]);
  const watchCoins = watchIds.map((id) => byId[id]).filter(Boolean);
  const recentRows = recent.map((r) => ({ ...r, live: byId[r.id] })).slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
            {greet}{name ? `, ${name}` : ""}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs text-white/40">
              {today}
            </p>
            <StatusPill status={status} updatedAt={priceUpdated || updatedAt} onRetry={() => { retry(); retryPrices(); }} />
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setCustomize((v) => !v)} aria-expanded={customize}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <SlidersHorizontal size={13} /> Customize
          </button>
          {customize && (
            <div className="absolute right-0 top-10 z-50 w-60 rounded-2xl border border-white/10 bg-[#0b0f1a]/97 p-2 shadow-2xl backdrop-blur-xl">
              <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">Visible panels</p>
              {PANEL_DEFS.map((p) => (
                <button
                  key={p.key} role="switch" aria-checked={panels[p.key]}
                  onClick={() => setPanel(p.key, !panels[p.key])}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-white/75 transition hover:bg-white/[0.05]"
                >
                  {p.label}
                  <span className={cn("flex h-4 w-4 items-center justify-center rounded border", panels[p.key] ? "border-cyan-400 bg-cyan-400/20 text-cyan-300" : "border-white/20 text-transparent")}>
                    <Check size={11} />
                  </span>
                </button>
              ))}
              <button
                onClick={() => { const reset = Object.fromEntries(PANEL_DEFS.map((p) => [p.key, true])); setPanels(reset); try { localStorage.setItem(PANEL_KEY, JSON.stringify(reset)); } catch { /* ignore */ } }}
                className="mt-1 w-full rounded-lg border-t border-white/[0.07] px-2 py-1.5 text-left text-[11px] text-white/50 hover:text-white"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Ticker strip */}
      <div className="thin-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Key prices">
        {tickerIds.map((id) => {
          const c = byId[id];
          return (
            <Link
              key={id} to={`/markets/${encodeURIComponent(id)}`}
              className="group flex min-w-[168px] flex-1 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 transition hover:border-cyan-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              {c ? (
                <>
                  <CoinImg src={c.image} symbol={c.symbol} size="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/70 group-hover:text-white">{c.symbol}</p>
                    <p className="num text-sm text-white">{c.price != null ? fmtUsd(c.price) : "—"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("num text-[11px]", (c.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtPct(c.change24h)}</span>
                    <Sparkline data={c.spark ?? []} change={c.change24h ?? 0} width={56} height={18} />
                  </div>
                </>
              ) : (
                <div className="flex w-full items-center gap-3" aria-hidden>
                  <div className="skeleton h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1.5"><div className="skeleton h-3 w-10 rounded" /><div className="skeleton h-3.5 w-16 rounded" /></div>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* First-run onboarding — honest checklist, dismissible, never returns */}
      {showOnboard && (
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.06] via-transparent to-violet-500/[0.05] p-4 sm:p-5">
          <button onClick={dismissOnboard} aria-label="Dismiss getting started" className="absolute right-3 top-3 rounded-lg p-1 text-white/40 transition hover:text-white">✕</button>
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-cyan-300" />
            <h3 className="text-sm font-semibold text-white">Getting started</h3>
            <span className="text-[11px] text-white/40">— three steps to make this workspace yours</span>
          </div>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              { to: "/markets", icon: Star, title: "Star assets", desc: "Build a watchlist that follows you across the app." },
              { to: "/alerts", icon: BellPlus, title: "Create a price alert", desc: "Get pinged when an asset crosses your level." },
              { to: "/trade", icon: ArrowRight, title: "Try paper trading", desc: "Practice with 100,000 simulated USDT — zero real money." },
            ].map(({ to, icon: Icon, title, desc }) => (
              <li key={to}>
                <Link to={to} className="group flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-cyan-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
                  <span className="rounded-lg bg-white/[0.05] p-1.5 text-cyan-300"><Icon size={14} /></span>
                  <span>
                    <span className="block text-xs font-semibold text-white">{title}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-white/45">{desc}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Row A — chart + stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        {panels.chart && (
          <div className="lg:col-span-2">
            <Panel
              title="Primary chart" desc="Timeframes, indicators and crosshair — preferences sync to your account"
              bodyClassName="p-0"
              actions={
                <div className="flex flex-wrap items-center gap-1">
                  {chips.map((id) => {
                    const c = byId[id];
                    const active = id === chartCoin;
                    return (
                      <button
                        key={id} onClick={() => pickChart(id)} aria-pressed={active}
                        title={c?.name || id}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                          active ? "bg-white text-black" : "text-white/50 hover:bg-white/[0.06] hover:text-white"
                        )}
                      >
                        {c?.symbol || id.slice(0, 4)}
                      </button>
                    );
                  })}
                </div>
              }
            >
              <TradingChartPanel coinId={chartCoin} coin={byId[chartCoin]} height={430} />
            </Panel>
          </div>
        )}

        {panels.stats && (
          <Panel
            title="Market stats" desc="Global crypto market — aggregated"
            actions={<StatusPill status={ovStatus} onRetry={() => setOvTick((t) => t + 1)} compact />}
          >
            {ovStatus === "loading" && !overview ? (
              <div className="grid grid-cols-2 gap-3" aria-hidden>
                {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
              </div>
            ) : ovStatus === "error" && !overview ? (
              <EmptyState title="Stats unavailable" copy="The market overview endpoint did not respond." />
            ) : overview ? (
              <>
                <dl className="grid grid-cols-2 gap-3">
                  {[
                    ["Total market cap", fmtUsd(overview.totalMarketCapUsd, 0)],
                    ["24h volume", fmtUsd(overview.totalVolumeUsd, 0)],
                    ["BTC dominance", overview.btcDominance != null ? `${overview.btcDominance.toFixed(1)}%` : "—"],
                    ["ETH dominance", overview.ethDominance != null ? `${overview.ethDominance.toFixed(1)}%` : "—"],
                  ].map(([t, v]) => (
                    <div key={t} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <dt className="text-[10px] uppercase tracking-widest text-white/35">{t}</dt>
                      <dd className="num mt-1 text-sm font-semibold text-white">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/25">
                  <span>{overview.activeCryptos?.toLocaleString()} active assets</span>
                  <span>CoinGecko{overview.updatedAt ? ` · ${new Date(overview.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                </div>
              </>
            ) : null}
          </Panel>
        )}
      </div>

      {/* Row B — watchlist · recent · portfolio */}
      {(panels.watchlist || panels.recent || panels.portfolio) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {panels.watchlist && (
            <Panel
              title="Watchlist" desc={`${watchIds.length} asset${watchIds.length === 1 ? "" : "s"} tracked`}
              actions={<AddAsset onSelect={(c) => toggleWatch(c.id)} selectedIds={watchIds} />}
            >
              {watchIds.length === 0 ? (
                <EmptyState
                  title="Start your watchlist" className="border-0 py-8"
                  copy="Star assets in Markets or add them here to track prices at a glance."
                  action={<Button to="/markets" size="sm" variant="secondary">Browse markets</Button>}
                />
              ) : watchCoins.length === 0 ? (
                <div className="space-y-2" aria-hidden>{[1, 2, 3].map((i) => <div key={i} className="skeleton h-11 rounded-lg" />)}</div>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {watchCoins.map((c) => (
                    <li key={c.id} className="group flex items-center gap-2.5 py-2">
                      <button onClick={() => removeWatch(c.id)} aria-label={`Remove ${c.name} from watchlist`} className="rounded p-1 text-amber-400/80 opacity-60 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
                        <Star size={13} fill="currentColor" />
                      </button>
                      <CoinImg src={c.image} symbol={c.symbol} size="h-6 w-6" />
                      <Link to={`/markets/${encodeURIComponent(c.id)}`} className="min-w-0 flex-1 truncate text-sm text-white/85 hover:text-cyan-200">{c.name}</Link>
                      <Sparkline data={c.spark ?? []} change={c.change24h ?? 0} width={60} height={20} />
                      <div className="w-20 text-right">
                        <p className="num text-xs text-white">{c.price != null ? fmtUsd(c.price) : "—"}</p>
                        <p className={cn("num text-[10px]", (c.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtPct(c.change24h)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {watchIds.length > 0 && (
                <Link to="/watchlist" className="mt-3 inline-block text-[11px] font-medium text-cyan-300 hover:text-cyan-200">Open full watchlist →</Link>
              )}
            </Panel>
          )}

          {panels.recent && (
            <Panel
              title="Recently viewed" desc="Remembered on this device"
              actions={recent.length > 0 && (
                <button onClick={clearRecent} className="text-[11px] text-white/40 transition hover:text-white">Clear</button>
              )}
            >
              {recentRows.length === 0 ? (
                <EmptyState title="Nothing viewed yet" className="border-0 py-8" copy="Assets you open will appear here for quick access." />
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {recentRows.map((r) => (
                    <li key={r.id}>
                      <Link to={`/markets/${encodeURIComponent(r.id)}`} className="flex items-center gap-2.5 py-2 transition hover:bg-white/[0.02]">
                        <CoinImg src={r.image} symbol={r.symbol} size="h-6 w-6" />
                        <span className="min-w-0 flex-1 truncate text-sm text-white/85 hover:text-cyan-200">{r.name}</span>
                        {r.live?.price != null ? (
                          <>
                            <span className="num text-xs text-white">{fmtUsd(r.live.price)}</span>
                            <span className={cn("num w-14 text-right text-[11px]", (r.live.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtPct(r.live.change24h)}</span>
                          </>
                        ) : (
                          <span className="text-[11px] text-white/30">—</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {panels.portfolio && (
            <Panel
              title="Portfolio" desc={authenticated ? "Paper-trading account" : "Simulated trading account"}
              actions={authenticated && <Badge tone="violet">Paper</Badge>}
            >
              {!authenticated ? (
                <EmptyState
                  title="See your portfolio here" className="border-0 py-8"
                  copy="Sign in to track a simulated portfolio seeded with 100,000 USDT — real market prices, zero real money."
                  action={
                    <div className="mt-1 flex gap-2">
                      <Button to="/login" size="sm">Sign in</Button>
                      <Button to="/trade" size="sm" variant="secondary">Paper trading</Button>
                    </div>
                  }
                />
              ) : pfStatus === "loading" && !portfolio ? (
                <div className="space-y-2" aria-hidden>{[1, 2, 3].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
              ) : pfStatus === "error" && !portfolio ? (
                <EmptyState title="Portfolio unavailable" className="border-0 py-8" copy="Could not load your paper portfolio." action={<Button size="sm" variant="secondary" onClick={() => setPfTick((t) => t + 1)}>Retry</Button>} />
              ) : portfolio ? (
                <>
                  <p className="num text-2xl font-semibold text-white">{fmtUsd(portfolio.total, 2)}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">{portfolio.holdings?.length || 0} asset{(portfolio.holdings?.length || 0) === 1 ? "" : "s"} · estimated from recorded fills</p>
                  <ul className="mt-3 space-y-1.5">
                    {(portfolio.holdings || []).slice(0, 4).map((h) => (
                      <li key={h.asset} className="flex items-center justify-between text-xs">
                        <span className="uppercase tracking-wide text-white/60">{h.asset}</span>
                        <span className="num text-white/90">{fmtUsd(h.value, 2)}</span>
                      </li>
                    ))}
                    {(!portfolio.holdings || portfolio.holdings.length === 0) && (
                      <li className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-[11px] text-white/40">
                        No holdings yet — place your first paper trade.
                      </li>
                    )}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <Button to="/portfolio" size="sm" variant="secondary" className="flex-1">Portfolio</Button>
                    <Button to="/trade" size="sm" className="flex-1">Trade</Button>
                  </div>
                </>
              ) : null}
            </Panel>
          )}
        </div>
      )}

      {/* Row C — activity */}
      {panels.activity && (
        <Panel title="Market activity" desc="Biggest real movers in the current market set" className="lg:col-span-3">
          <ActivityFeed coins={coins} status={status} updatedAt={updatedAt} onRetry={retry} limit={8} />
        </Panel>
      )}

      {priceStatus === "error" && (
        <p className="text-center text-[11px] text-white/35">Some asset prices could not be refreshed — data shown may be from the last successful update.</p>
      )}
    </div>
  );
}
