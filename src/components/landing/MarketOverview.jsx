import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Search } from "lucide-react";
import { fmtUsd, fmtPct } from "../../lib/market.js";
import { Container, SectionHeading, Badge } from "../ui.jsx";
import { Reveal } from "../ui.jsx";
import { Sparkline } from "../Charts.jsx";
import { cn } from "../../lib/utils.js";

// Compact live overview: top assets by market cap with search + sortable
// price/change columns and sparklines. All real backend data.
export default function MarketOverview({ coins, status }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "rank", dir: 1 });

  const rows = useMemo(() => {
    const list = (coins || []).filter(
      (c) => !q || c.name?.toLowerCase().includes(q.toLowerCase()) || c.symbol?.toLowerCase().includes(q.toLowerCase())
    );
    const v = (c, k) => c[k] ?? (k === "rank" ? 1e9 : 0);
    return [...list].sort((a, b) => (v(a, sort.key) - v(b, sort.key)) * sort.dir).slice(0, 8);
  }, [coins, q, sort]);

  const th = (label, key) => (
    <button
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}
      className="inline-flex items-center gap-1 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      aria-label={`Sort by ${label}`}
    >
      {label}
    </button>
  );

  return (
    <Container>
      <Reveal>
        <SectionHeading
          eyebrow="Market overview"
          title="Every move, measured live"
          desc="Real CoinGecko prices streamed through our backend — no invented numbers."
        />
      </Reveal>
      <Reveal delay={0.08}>
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0D1220]/70">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-4">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search assets…"
                aria-label="Search assets"
                className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              />
            </div>
            <Badge tone={status === "live" ? "success" : status === "stale" ? "warning" : "danger"}>
              <span className={cn("h-1.5 w-1.5 rounded-full", status === "live" ? "animate-pulse bg-emerald-400" : status === "stale" ? "bg-amber-400" : "bg-red-400")} aria-hidden />
              {status === "live" ? "Live prices" : status === "stale" ? "Updating…" : "Feed offline"}
            </Badge>
            <Link to="/markets" className="text-xs text-cyan-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
              View all markets →
            </Link>
          </div>
          {!rows.length ? (
            <p className="px-4 py-10 text-center text-sm text-white/45">
              {status === "error" ? "Market data is unavailable right now. Please retry shortly." : "No assets match your search."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-white/40">
                    <th className="px-4 py-3">{th("Asset", "rank")}</th>
                    <th className="px-4 py-3 text-right">{th("Price", "price")}</th>
                    <th className="px-4 py-3 text-right">{th("24h", "change24h")}</th>
                    <th className="px-4 py-3 text-right">{th("Mkt cap", "marketCap")}</th>
                    <th className="px-4 py-3 text-right">Last 7d</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const up = (c.change24h ?? 0) >= 0;
                    return (
                      <tr key={c.id} className="border-t border-white/5 transition hover:bg-cyan-400/[0.04]">
                        <td className="px-4 py-3">
                          <Link to={`/markets/${encodeURIComponent(c.id)}`} className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                            {c.image ? <img src={c.image} alt="" loading="lazy" className="h-7 w-7 rounded-full" /> : (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">{String(c.symbol || "?").slice(0, 2)}</span>
                            )}
                            <span>
                              <span className="block font-medium text-white">{c.name}</span>
                              <span className="block text-[11px] uppercase text-white/40">{c.symbol}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-white">{fmtUsd(c.price)}</td>
                        <td className={cn("px-4 py-3 text-right tabular-nums", up ? "text-emerald-400" : "text-red-400")}>
                          <span className="inline-flex items-center gap-0.5">
                            {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
                            {fmtPct(c.change24h)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-white/70">{fmtUsd(c.marketCap, 0)}</td>
                        <td className="px-4 py-3"><div className="flex justify-end"><Sparkline data={c.sparkline ?? []} change={c.change7d ?? 0} /></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Reveal>
    </Container>
  );
}
