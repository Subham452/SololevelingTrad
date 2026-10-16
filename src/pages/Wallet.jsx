import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowUpRight, Info } from "lucide-react";
import { tradingApi } from "../lib/trading.js";
import { walletApi, fmtMinor, DEPOSIT_STATUS, LEDGER_TYPE } from "../lib/wallet.js";
import { Card, Badge, Button, Panel, EmptyState, LoadingState } from "../components/ui.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import { fmtUsd } from "../lib/market.js";

const kindTone = { seed: "accent", buy: "success", sell: "warning", fee: "default", reserve: "default", release: "default", cancel_release: "default" };

// ---------------------------------------------------------------------------
// Wallet — TWO clearly separated balances:
//   * REAL money  — funded only by a provider-confirmed deposit, spent only by
//                   a guarded debit. Never shown as trading capital.
//   * PAPER money — the simulated trading environment (unchanged below).
// The two are different collections on the server and are never mixed here.
// ---------------------------------------------------------------------------
export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [walletErr, setWalletErr] = useState("");
  const [recent, setRecent] = useState(null);

  // Paper-trading balances (existing behaviour, preserved).
  const [paper, setPaper] = useState(null);
  const [txns, setTxns] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    walletApi.summary().then(setWallet).catch((e) => setWalletErr(e?.message || "Failed to load wallet"));
    walletApi.transactions({ page: 1, limit: 5 }).then((d) => setRecent(d?.items || [])).catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    tradingApi.wallet().then(setPaper).catch((e) => setError(e?.message || "Failed to load wallet"));
  }, []);
  useEffect(() => {
    setTxns(null);
    tradingApi.txns(`?page=${page}&limit=20`).then((d) => { setTxns(d?.items || []); setTotal(d?.total || 0); }).catch(() => setTxns([]));
  }, [page]);

  const bals = paper?.balances || [];
  const totalAvail = bals.reduce((s, b) => s + (b.asset === "USDT" ? b.available : 0), 0);
  const w = wallet?.wallet;
  const avail = w?.deposits;

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* REAL FUNDS                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl font-bold tracking-tight text-white">Wallet</h2>
          <Badge tone="accent">Real funds</Badge>
        </div>
        <p className="mt-1 text-xs text-white/50">
          Confirmed deposits only. Real balances are held separately from the simulated trading environment below.
        </p>

        {walletErr ? <Card error={walletErr} className="mt-4" /> : !w ? (
          <div className="mt-4"><LoadingState label="Loading wallet" rows={2} /></div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-white/[0.02]">
                <p className="text-[11px] uppercase tracking-widest text-white/40">Available</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{fmtMinor(w.availableMinor, w.currency)}</p>
              </Card>
              <Card className="bg-white/[0.02]">
                <p className="text-[11px] uppercase tracking-widest text-white/40">Pending deposits</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-white/80">{fmtMinor(w.pendingMinor, w.currency)}</p>
                <p className="mt-1 text-[11px] text-white/35">{w.pendingDeposits} awaiting confirmation</p>
              </Card>
              <Card className="bg-white/[0.02]">
                <p className="text-[11px] uppercase tracking-widest text-white/40">Total deposits</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{fmtMinor(w.totalDepositsMinor, w.currency)}</p>
                <p className="mt-1 text-[11px] text-white/35">{w.totalDepositsCount} confirmed</p>
              </Card>
              <Card className="bg-white/[0.02]">
                <p className="text-[11px] uppercase tracking-widest text-white/40">Total withdrawals</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-white/40">—</p>
                <p className="mt-1 text-[11px] text-white/35">{w.withdrawalsSupported ? "Supported" : "Not available on this deployment"}</p>
              </Card>
            </div>

            {/* Availability + limits + Add money */}
            <Card className="bg-white/[0.02]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white">Add money</h3>
                    {avail?.available ? <Badge tone="success">Available</Badge> : <Badge tone="warning">Unavailable</Badge>}
                  </div>
                  {avail?.available ? (
                    <p className="mt-1 text-xs text-white/50">
                      Deposits are processed by Whop. Funds become available only after the payment is confirmed by the provider.
                    </p>
                  ) : (
                    <p className="mt-1 max-w-2xl text-xs text-white/50">{avail?.reason}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-white/45">
                    <span>Limits: {fmtMinor(w.limits.minMinor, w.limits.currency)} – {fmtMinor(w.limits.maxMinor, w.limits.currency)}</span>
                    {w.limits.presets?.length ? <span>Amounts: {w.limits.presets.map((p) => fmtMinor(p.amountMinor, w.limits.currency)).join(", ")}</span> : null}
                    <span>Deposit fees: none charged by this platform</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="accent" size="sm" to="/wallet/add" disabled={!avail?.available}>
                    <Plus className="h-4 w-4" /> Add money
                  </Button>
                  <Button variant="secondary" size="sm" to="/wallet/transactions">
                    History <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {w.discrepancy ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>This balance is under review by an administrator. Contact support if you have questions.</span>
                </div>
              ) : null}
            </Card>

            {/* Recent transactions */}
            <Panel title="Recent transactions" desc="Real-money ledger" actions={<Link to="/wallet/transactions" className="text-xs text-cyan-300 hover:text-cyan-200">View all</Link>}>
              {recent === null ? <SkeletonLoader rows={3} /> : recent.length === 0 ? (
                <EmptyState title="No transactions yet" desc="Confirmed deposits and adjustments appear here." action={avail?.available ? <Button variant="accent" size="sm" to="/wallet/add" className="mt-2">Add money</Button> : null} />
              ) : (
                <ul className="space-y-1.5">
                  {recent.map((t) => {
                    const meta = LEDGER_TYPE[t.type] || { label: t.type, sign: "", tone: "default" };
                    const signed = t.direction === "debit" ? -t.amountMinor : (t.direction === "credit" ? t.amountMinor : 0);
                    return (
                      <li key={t._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="tabular-nums text-white/80">
                          {signed !== 0 ? `${signed > 0 ? "+" : ""}${fmtMinor(signed, t.currency)}` : fmtMinor(t.amountMinor, t.currency)}
                        </span>
                        <span className="font-mono text-[11px] text-white/40">{t.reference}</span>
                        <span className="ml-auto text-white/35">{new Date(t.createdAt).toLocaleString()}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            {/* Pending deposits */}
            {recent?.length > 0 && recent.some((t) => t.status === "pending" && t.type === "deposit_hold") ? (
              <Panel title="Pending deposits" desc="Not spendable until confirmed by the payment provider">
                <ul className="space-y-1.5">
                  {recent.filter((t) => t.type === "deposit_hold" && t.status === "pending").map((t) => (
                    <li key={t._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs">
                      <Badge tone={DEPOSIT_STATUS.pending.tone}>Pending</Badge>
                      <span className="tabular-nums text-white/80">{fmtMinor(t.amountMinor, t.currency)}</span>
                      <span className="font-mono text-[11px] text-white/40">{t.reference}</span>
                      <Link to={`/wallet/transactions?deposit=${encodeURIComponent(t.reference)}`} className="ml-auto text-[11px] text-cyan-300 hover:text-cyan-200">Open</Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* PAPER (SIMULATED) — unchanged                                     */}
      {/* ----------------------------------------------------------------- */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl font-bold tracking-tight text-white">Trading wallet</h2>
          <Badge tone="violet">Paper</Badge>
        </div>
        <p className="mt-1 text-xs text-white/50">Simulated balances only — not real funds. Deposits/withdrawals require a licensed provider and are disabled in paper mode.</p>

        {error ? <Card error={error} className="mt-4" /> : !paper ? <div className="mt-4"><SkeletonLoader rows={3} /></div> : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="bg-white/[0.02]"><p className="text-[11px] uppercase tracking-widest text-white/40">Available USDT</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{fmtUsd(totalAvail, 2)}</p></Card>
              <Card className="bg-white/[0.02]"><p className="text-[11px] uppercase tracking-widest text-white/40">Assets</p><p className="mt-1 text-2xl font-semibold text-white">{bals.length}</p></Card>
              <Card className="bg-white/[0.02]"><p className="text-[11px] uppercase tracking-widest text-white/40">Reserved (open orders)</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{bals.reduce((s, b) => s + b.reserved, 0).toFixed(4)}</p></Card>
            </div>

            <Card className="bg-white/[0.02]">
              <h2 className="text-sm font-medium text-white">Balances</h2>
              <ul className="mt-2 space-y-1.5">{bals.map((b) => (
                <li key={b._id || b.asset} className="flex items-center gap-3 rounded-lg border border-white/5 px-3 py-2 text-sm">
                  <span className="font-medium text-white">{b.asset}</span>
                  <span className="ml-auto tabular-nums text-white/70">{b.available}</span>
                  <span className="w-24 text-right tabular-nums text-white/40">res {b.reserved}</span>
                </li>))}</ul>
              <Link to="/portfolio" className="mt-3 inline-block text-xs text-cyan-300 hover:text-cyan-200">View portfolio →</Link>
            </Card>

            <Card className="bg-white/[0.02]">
              <h2 className="text-sm font-medium text-white">Simulation history</h2>
              {txns === null ? <div className="mt-2"><SkeletonLoader rows={4} /></div> : txns.length === 0 ? <p className="mt-2 text-xs text-white/40">No transactions yet.</p> : (
                <>
                  <ul className="mt-2 space-y-1.5">{txns.map((t) => (
                    <li key={t._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-white/65">
                      <Badge tone={kindTone[t.kind] || "default"}>{t.kind}</Badge>
                      <span className="tabular-nums">{t.asset} {t.delta >= 0 ? "+" : ""}{t.delta}</span>
                      {t.note && <span className="text-white/40">— {t.note}</span>}
                      <span className="ml-auto text-white/35">{new Date(t.createdAt).toLocaleString()}</span>
                    </li>))}</ul>
                  <div className="mt-3 flex items-center gap-2">
                    <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 disabled:opacity-40">Prev</button>
                    <span className="text-xs text-white/50">Page {page} · {total} total</span>
                    <button disabled={txns.length < 20} onClick={() => setPage((p) => p + 1)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 disabled:opacity-40">Next</button>
                  </div>
                </>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
