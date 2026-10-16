import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { tradingApi } from "../lib/trading.js";
import { Card, Button, Badge } from "../components/ui.jsx";
import TradingChartPanel from "../components/charts/TradingChartPanel.jsx";
import DepthChart from "../components/charts/DepthChart.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import CoinSearch from "../components/CoinSearch.jsx";
import { cn } from "../lib/utils.js";

const DEFAULT_PAIR = "BTC/USDT";
const pairCoin = (sym) => ({ "BTC/USDT": "bitcoin", "ETH/USDT": "ethereum", "SOL/USDT": "solana" }[sym] || "bitcoin");

function OrderForm({ pair, onDone, notify }) {
  const [side, setSide] = useState("buy");
  const [type, setType] = useState("market");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState(null);
  const base = pair.split("/")[0];

  useEffect(() => { tradingApi.wallet().then((d) => setWallet(d)).catch(() => setWallet(null)); }, []);
  const bal = (a) => wallet?.balances?.find((b) => b.asset === a)?.available ?? null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { pair, side, type, qty: Number(qty) };
      if (type === "limit") body.limitPrice = Number(price);
      if (type === "stop-loss" || type === "take-profit") body.stopPrice = Number(price);
      body.clientOrderId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const d = await tradingApi.place(body);
      notify(d?.order?.status === "REJECTED" ? `Rejected: ${d.order.rejectReason || "check balance"}` : `${side.toUpperCase()} ${type} ${d?.order?.status}`, d?.order?.status !== "REJECTED");
      setQty(""); setPrice("");
      onDone?.();
    } catch (err) { notify(err?.message || "Order failed", false); }
    finally { setBusy(false); }
  };

  return (
    <Card className="bg-white/[0.02] backdrop-blur-xl">
      <div className="grid grid-cols-2 gap-1 rounded-full border border-white/10 p-1" role="tablist" aria-label="Side">
        {(["buy", "sell"]).map((s) => (
          <button key={s} role="tab" aria-selected={side === s} onClick={() => setSide(s)}
            className={cn("rounded-full py-1.5 text-sm font-medium capitalize transition", side === s ? (s === "buy" ? "bg-green-500 text-black" : "bg-red-500 text-white") : "text-white/60")}>{s}</button>
        ))}
      </div>
      <div className="mt-3 flex gap-1" role="group" aria-label="Order type">
        {(["market", "limit", "stop-loss", "take-profit"]).map((t) => (
          <button key={t} onClick={() => setType(t)} aria-pressed={type === t} className={cn("rounded-full border px-2.5 py-1 text-[11px]", type === t ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-white/50")}>{t}</button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 space-y-2.5">
        <label className="block text-xs text-white/60">Quantity ({base})
          <input value={qty} onChange={(e) => setQty(e.target.value)} required min="0" step="any" type="number" inputMode="decimal" aria-label={`Quantity in ${base}`}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm tabular-nums text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
        </label>
        {type !== "market" && (
          <label className="block text-xs text-white/60">{type === "limit" ? "Limit price (USDT)" : "Trigger price (USDT)"}
            <input value={price} onChange={(e) => setPrice(e.target.value)} required min="0" step="any" type="number" inputMode="decimal" aria-label="Order price"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm tabular-nums text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
          </label>
        )}
        <div className="flex gap-1">
          {[25, 50, 75, 100].map((p) => (
            <button type="button" key={p} onClick={() => { const b = side === "buy" ? bal("USDT") : bal(base); if (b) setQty(String((b * p) / 100)); }} className="flex-1 rounded-lg border border-white/10 py-1 text-[11px] text-white/60 hover:text-white">{p}%</button>
          ))}
        </div>
        <p className="text-[11px] text-white/40">Avail: {bal("USDT") ?? "—"} USDT · {bal(base) ?? "—"} {base} · Fee 0.1%</p>
        <Button disabled={busy} className={cn("w-full", side === "buy" ? "!bg-green-500 !text-black" : "!bg-red-500 !text-white")}>{busy ? "Placing…" : `${side === "buy" ? "Buy" : "Sell"} ${base}`}</Button>
      </form>
      <p className="mt-2 text-[11px] text-amber-300/70">Paper trading — simulated fills, not real execution.</p>
    </Card>
  );
}

export default function Trade() {
  const { pair: urlPair } = useParams();
  const [pairs, setPairs] = useState([]);
  const [pair, setPair] = useState(urlPair ? decodeURIComponent(urlPair) : localStorage.getItem("slt_pair") || DEFAULT_PAIR);
  const [book, setBook] = useState(null);
  const [orders, setOrders] = useState(null);
  const [toast, setToast] = useState(null);
  const notify = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => { tradingApi.pairs().then((d) => setPairs(d?.pairs || [])).catch(() => setPairs([])); }, []);
  useEffect(() => { localStorage.setItem("slt_pair", pair); }, [pair]);

  const refresh = useCallback(async () => {
    tradingApi.book(pair).then(setBook).catch(() => setBook(null));
    tradingApi.orders("?limit=20").then((d) => setOrders(d?.items || [])).catch(() => setOrders([]));
  }, [pair]);

  useEffect(() => { setBook(null); refresh(); }, [refresh]);
  useEffect(() => { const t = setInterval(refresh, 30e3); return () => clearInterval(t); }, [refresh]);

  const open = (orders || []).filter((o) => ["OPEN", "PENDING", "PARTIALLY_FILLED"].includes(o.status));
  const done = (orders || []).filter((o) => !["OPEN", "PENDING", "PARTIALLY_FILLED"].includes(o.status));

  return (
    <div>
      {toast && <div role="status" className={cn("fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full border px-4 py-2 text-sm backdrop-blur-xl", toast.ok ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-rose-500/40 bg-rose-500/15 text-rose-200")}>{toast.msg}</div>}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex gap-1.5" role="tablist" aria-label="Trading pair">
          {(pairs.length ? pairs.map((p) => p.symbol) : [DEFAULT_PAIR]).map((s) => (
            <button key={s} role="tab" aria-selected={pair === s} onClick={() => setPair(s)} className={cn("rounded-full border px-3.5 py-1.5 text-xs font-medium", pair === s ? "bg-white text-black" : "border-white/10 text-white/60 hover:text-white")}>{s}</button>
          ))}
        </div>
        <CoinSearch className="w-full lg:ml-auto lg:max-w-xs" />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_280px_300px]">
        <div className="min-w-0">
          <TradingChartPanel coinId={pairCoin(pair)} coin={{ symbol: pair.split("/")[0], image: null, change24h: null }} height={420} />
          <Card className="mt-3 bg-white/[0.02] backdrop-blur-xl">
            <h2 className="text-xs font-medium uppercase tracking-widest text-white/40">Depth <span className="text-white/30">(simulated)</span></h2>
            {book ? <DepthChart book={book} height={180} /> : <div className="mt-2"><SkeletonLoader rows={3} /></div>}
          </Card>
          <div className="mt-3">
            <h2 className="text-xs font-medium uppercase tracking-widest text-white/40">Open orders</h2>
            {orders === null ? <SkeletonLoader rows={2} /> : open.length === 0 ? <p className="mt-2 text-xs text-white/40">No open orders.</p> : (
              <ul className="mt-2 space-y-1.5">{open.map((o) => (
                <li key={o._id} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs">
                  <Badge tone={o.side === "buy" ? "success" : "danger"}>{o.side}</Badge>
                  <span className="text-white/70">{o.type} · {o.qty} @ {o.limitPrice || o.stopPrice || "mkt"}</span>
                  <Badge>{o.status}</Badge>
                  <button onClick={async () => { try { await tradingApi.cancel(o._id); notify("Order cancelled"); refresh(); } catch (e) { notify(e?.message || "Cancel failed", false); } }} className="ml-auto text-red-300 hover:text-red-200">Cancel</button>
                </li>))}</ul>)}
            <h2 className="mt-4 text-xs font-medium uppercase tracking-widest text-white/40">Order history</h2>
            {done.length === 0 ? <p className="mt-2 text-xs text-white/40">No history yet.</p> : (
              <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">{done.slice(0, 20).map((o) => (
                <li key={o._id} className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-white/60">
                  <Badge tone={o.side === "buy" ? "success" : "danger"}>{o.side}</Badge>
                  <span>{o.qty} @ {o.avgPrice || "—"} · fee {o.fee}</span>
                  <Badge tone={o.status === "FILLED" ? "success" : "default"}>{o.status}</Badge>
                </li>))}</ul>)}
          </div>
        </div>

        <Card className="bg-white/[0.02] backdrop-blur-xl">
          <h2 className="text-xs font-medium uppercase tracking-widest text-white/40">Order book <span className="text-white/30">(simulated)</span></h2>
          {!book ? <div className="mt-2"><SkeletonLoader rows={4} /></div> : (
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] tabular-nums">
              <div><p className="mb-1 text-red-400">Asks</p>{[...book.asks].reverse().map((a, i) => <p key={i} className="flex justify-between py-0.5 text-white/60"><span className="text-red-400">{a.price}</span><span>{a.qty}</span></p>)}</div>
              <div><p className="mb-1 text-green-400">Bids</p>{book.bids.map((b, i) => <p key={i} className="flex justify-between py-0.5 text-white/60"><span className="text-green-400">{b.price}</span><span>{b.qty}</span></p>)}</div>
              <p className="col-span-2 mt-1 text-white/40">Mid {book.mid} · depth is illustrative, fills use live mid.</p>
            </div>)}
        </Card>

        <OrderForm pair={pair} onDone={refresh} notify={notify} />
      </div>
      <p className="mt-3 text-[11px] text-white/35">Paper-trading venue: balances start at 100,000 simulated USDT. Chart shows live reference market data in USD; execution price is the server-fetched live price, never a browser value.</p>
    </div>
  );
}
