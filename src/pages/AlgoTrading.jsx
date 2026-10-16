import { useEffect, useState } from "react";
import { Play, Pause, Square, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { Container, Section, Card, Button, Badge, EmptyState } from "../components/ui.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import { useAuth } from "../context/useAuth.js";
import { Link } from "react-router-dom";

const coinFor = (sym) => ({ "BTC/USDT": "bitcoin", "ETH/USDT": "ethereum", "SOL/USDT": "solana" }[sym] || "bitcoin");

export default function AlgoTrading() {
  const { plan } = useAuth();
  const [strategies, setStrategies] = useState(null);
  const [bots, setBots] = useState(null);
  const [events, setEvents] = useState(null);
  const [msg, setMsg] = useState("");

  const load = () => {
    api.get("/algo/strategies").then((d) => setStrategies(d?.strategies || [])).catch(() => setStrategies([]));
    api.get("/algo/bots").then((d) => setBots(d?.bots || [])).catch(() => setBots([]));
    api.get("/algo/events").then((d) => setEvents(d?.items || [])).catch(() => setEvents([]));
  };
  useEffect(load, []);

  const act = async (id, action) => {
    setMsg("");
    try { await api.post(`/algo/bots/${id}/${action}`, {}); load(); }
    catch (e) { setMsg(e?.message || "Action failed"); }
  };
  const del = async (id) => { if (!confirm("Delete this bot?")) return; try { await api.del(`/algo/bots/${id}`); load(); } catch (e) { setMsg(e?.message || "Delete failed"); } };

  const create = async (strategy) => {
    const pair = prompt("Trading pair (e.g. BTC/USDT)", "BTC/USDT");
    if (!pair) return;
    setMsg("");
    try { await api.post("/algo/bots", { strategy, pair: pair.toUpperCase(), coinId: coinFor(pair.toUpperCase()), maxOrderSize: 200 }); load(); }
    catch (e) { setMsg(e?.message || "Could not create bot"); }
  };

  const eligible = ["AWAKENED", "MONARCH"].includes(String(plan || "").toUpperCase());

  return (
    <Section><Container>
      <h1 className="text-xl font-semibold text-white">Algo Trading <Badge>Paper</Badge></h1>
      <p className="mt-1 text-xs text-white/50">Server-run strategy worker. Paper execution only — no guaranteed returns. Past behaviour never predicts future results.</p>
      {msg && <p className="mt-2 text-xs text-amber-300">{msg}</p>}

      {!eligible ? (
        <Card className="mt-4 border-amber-500/30 bg-white/[0.02]">
          <h2 className="text-sm font-medium text-amber-300">Subscription required</h2>
          <p className="mt-1 text-xs text-white/60">Algo trading is available on AWAKENED or MONARCH plans. Access is enforced server-side.</p>
          <Link to="/subscription"><Button size="sm" className="mt-3">View plans</Button></Link>
        </Card>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {strategies === null ? <SkeletonLoader rows={2} /> : strategies.map((s) => (
              <Card key={s.id} className="bg-white/[0.02] backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-white">{s.name}</p>
                  <Badge tone={s.risk === "medium" ? "warning" : "success"}>{s.risk} risk</Badge>
                </div>
                <p className="mt-1 text-xs text-white/55">{s.desc}</p>
                <Button size="sm" className="mt-3" onClick={() => create(s.id)}>Deploy bot</Button>
              </Card>
            ))}
          </div>

          <h2 className="mt-6 mb-2 text-sm font-medium text-white">Your bots</h2>
          {bots === null ? <SkeletonLoader rows={2} /> : bots.length === 0 ? <EmptyState title="No bots yet" desc="Deploy a strategy above to get started." /> : (
            <ul className="space-y-2">{bots.map((b) => (
              <li key={b._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{b.name || b.strategy} · {b.pair}</p>
                  <p className="text-[11px] text-white/40">max order {b.maxOrderSize} · SL {b.stopLossPct}% · TP {b.takeProfitPct}% · P/L {b.realizedPnl?.toFixed(2)}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Badge tone={b.status === "running" ? "success" : b.status === "error" ? "danger" : "default"}>{b.status}</Badge>
                  {b.status !== "running" && <Button size="sm" variant="secondary" onClick={() => act(b._id, "start")}><Play size={13} /> Start</Button>}
                  {b.status === "running" && <Button size="sm" variant="secondary" onClick={() => act(b._id, "pause")}><Pause size={13} /> Pause</Button>}
                  <Button size="sm" variant="secondary" onClick={() => act(b._id, "stop")}><Square size={13} /> Stop</Button>
                  <button onClick={() => del(b._id)} aria-label="Delete bot" className="rounded-full p-1.5 text-white/40 hover:text-red-300"><Trash2 size={14} /></button>
                </div>
              </li>))}</ul>
          )}

          <h2 className="mt-6 mb-2 text-sm font-medium text-white">Recent events</h2>
          {events === null ? <SkeletonLoader rows={3} /> : events.length === 0 ? <p className="text-xs text-white/40">No events yet.</p> : (
            <ul className="space-y-1.5">{events.map((e) => (
              <li key={e._id} className="flex gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-white/60">
                <Badge>{e.type}</Badge><span>{e.message}</span>
                <span className="ml-auto text-white/35">{new Date(e.createdAt).toLocaleString()}</span>
              </li>))}</ul>
          )}
        </>
      )}
    </Container></Section>
  );
}
