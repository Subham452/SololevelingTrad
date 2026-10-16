import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { tradingApi } from "../lib/trading.js";
import { Card, Badge, EmptyState, Button } from "../components/ui.jsx";
import AllocationDonut from "../components/charts/AllocationDonut.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import { fmtUsd } from "../lib/market.js";

/** Real fills-per-day chart — aggregated from recorded paper trades only. */
function ActivityChart({ points }) {
  const data = (points || []).map((p) => ({ date: String(p.date).slice(5), fills: p.fills }));
  if (!data.length) return <p className="py-6 text-center text-xs text-white/40">No executions recorded yet.</p>;
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis allowDecimals={false} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#0b0f1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: "rgba(255,255,255,0.5)" }}
            formatter={(v) => [v, "Fills"]}
          />
          <Bar dataKey="fills" fill="#22d3ee" radius={[3, 3, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Portfolio() {
  const [pf, setPf] = useState(null);
  const [txns, setTxns] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    tradingApi.portfolio().then((d) => { if (live) setPf(d); }).catch((e) => { if (live) setError(e?.message || "Failed"); });
    tradingApi.txns("?limit=15").then((d) => { if (live) setTxns(d?.items || []); }).catch(() => { if (live) setTxns([]); });
    tradingApi.portfolioHistory().then((d) => { if (live) setHistory(d?.points || []); }).catch(() => { if (live) setHistory([]); });
    return () => { live = false; };
  }, [tick]);

  const total = pf?.total || 0;
  const held = pf?.holdings?.filter((h) => h.available + h.reserved > 0) || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-white">Portfolio <Badge tone="violet">Paper</Badge></h2>
          <p className="mt-0.5 text-xs text-white/40">Simulated holdings — not real money. Valued at live reference prices.</p>
        </div>
        <Button to="/trade" size="sm">Open terminal</Button>
      </div>

      {error ? (
        <Card error={error} className="flex items-center justify-between">
          <Button size="sm" variant="secondary" onClick={() => setTick((t) => t + 1)}>Retry</Button>
        </Card>
      ) : !pf ? (
        <SkeletonLoader rows={4} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="bg-white/[0.02]"><p className="text-[11px] uppercase tracking-widest text-white/40">Total value</p><p className="num mt-1 text-2xl font-semibold text-white">{fmtUsd(total, 0)}</p></Card>
            <Card className="bg-white/[0.02]"><p className="text-[11px] uppercase tracking-widest text-white/40">Assets held</p><p className="num mt-1 text-2xl font-semibold text-white">{held.length}</p></Card>
            <Card className="bg-white/[0.02]"><p className="text-[11px] uppercase tracking-widest text-white/40">Mode</p><p className="mt-1 text-lg font-semibold text-amber-300">Paper trading</p></Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-white/[0.02] backdrop-blur-xl">
              <h2 className="mb-3 text-sm font-medium text-white">Asset allocation</h2>
              <AllocationDonut holdings={held} total={total} height={200} />
            </Card>
            <Card className="bg-white/[0.02]">
              <h2 className="text-sm font-medium text-white">Execution activity</h2>
              <p className="mt-0.5 text-[11px] text-white/40">Recorded fills per day — your real paper trades, nothing modelled.</p>
              <div className="mt-3">{history === null ? <SkeletonLoader rows={2} /> : <ActivityChart points={history} />}</div>
            </Card>
          </div>

          {held.length === 0
            ? <EmptyState title="No holdings yet" desc="You hold 100,000 simulated USDT. Place your first paper trade." action={<Button to="/trade/BTC%2FUSDT" size="sm">Open terminal</Button>} />
            : (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-widest text-white/40">
                    <th className="px-4 py-3">Asset</th><th className="px-4 py-3 text-right">Available</th><th className="px-4 py-3 text-right">Reserved</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3 text-right">Share</th>
                  </tr></thead>
                  <tbody>{held.map((h) => (
                    <tr key={h.asset} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 font-medium uppercase text-white">{h.asset}</td>
                      <td className="num px-4 py-2.5 text-right text-white/70">{h.available}</td>
                      <td className="num px-4 py-2.5 text-right text-white/40">{h.reserved}</td>
                      <td className="num px-4 py-2.5 text-right text-white/70">{fmtUsd(h.price)}</td>
                      <td className="num px-4 py-2.5 text-right text-white">{fmtUsd(h.value, 0)}</td>
                      <td className="num px-4 py-2.5 text-right text-white/50">{total ? `${((h.value / total) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>))}</tbody>
                </table>
              </div>)}

          <Card className="bg-white/[0.02]">
            <h2 className="text-sm font-medium text-white">Ledger — recent transactions</h2>
            {!txns ? <div className="mt-2"><SkeletonLoader rows={3} /></div> : txns.length === 0 ? <p className="mt-2 text-xs text-white/40">No transactions.</p> : (
              <ul className="mt-2 space-y-1.5">{txns.map((t) => (
                <li key={t._id} className="flex flex-wrap gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-white/60">
                  <Badge>{t.kind}</Badge><span className="num">{t.asset} {t.delta >= 0 ? "+" : ""}{t.delta}</span>
                  <span className="ml-auto text-white/35">{new Date(t.createdAt).toLocaleString()}</span>
                </li>))}</ul>)}
          </Card>

          <p className="text-[11px] text-white/35">Paper portfolio only — balances are simulated and cannot be deposited or withdrawn. <Link to="/wallet" className="text-cyan-300/80 hover:text-cyan-200">View wallet</Link></p>
        </div>
      )}
    </div>
  );
}
