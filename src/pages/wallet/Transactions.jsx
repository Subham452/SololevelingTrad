import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, RefreshCw, CheckCircle2 } from "lucide-react";
import { walletApi, fmtMinor, DEPOSIT_STATUS, LEDGER_TYPE } from "../../lib/wallet.js";
import { Card, Badge, Button, Input, Panel, EmptyState, LoadingState, Segmented, FormField } from "../../components/ui.jsx";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "deposit_hold", label: "Deposit started" },
  { value: "deposit_credit", label: "Deposit confirmed" },
  { value: "deposit_reversed", label: "Refunds" },
  { value: "deposit_failed", label: "Failed" },
  { value: "adjustment", label: "Adjustments" },
];
const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "reversed", label: "Reversed" },
];

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Transaction history — search by reference, filter by type/status/date, with
// bounded pagination. Every row is scoped to the signed-in user by the server.
// The `?deposit=REF` query opens a specific deposit's detail (used after
// returning from checkout), where `status` from the URL is treated as a HINT
// only — the real state always comes from the server.
// ---------------------------------------------------------------------------
export default function Transactions() {
  const [params, setParams] = useSearchParams();
  const depositRef = params.get("deposit") || "";

  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [deposit, setDeposit] = useState(null);
  const [depositErr, setDepositErr] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Debounce the free-text search into the query actually used by the API.
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    walletApi.transactions({ page, limit: PAGE_SIZE, q, type, status, from, to })
      .then((d) => { if (!alive) return; setRows(d?.items || []); setTotal(d?.total || 0); })
      .catch((e) => { if (!alive) return; setRows([]); setError(e?.message || "Could not load transactions"); });
    return () => { alive = false; };
  }, [page, q, type, status, from, to]);

  // Load (and while pending, poll) the referenced deposit.
  useEffect(() => {
    if (!depositRef) { setDeposit(null); setDepositErr(""); return undefined; }
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const d = await walletApi.deposit(depositRef);
        if (!alive) return;
        setDeposit(d?.deposit || null);
        setDepositErr("");
        // Poll only while the deposit is still unresolved.
        if (d && !d.terminal) timer = setTimeout(load, 4000);
      } catch (e) {
        if (!alive) return;
        setDepositErr(e?.message || "Deposit not found");
      }
    };
    load();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [depositRef]);

  const closeDeposit = () => {
    const next = new URLSearchParams(params);
    next.delete("deposit");
    setParams(next, { replace: true });
  };

  const runVerify = async () => {
    if (!depositRef) return;
    setVerifying(true);
    try {
      const hint = new URLSearchParams(window.location.search).get("payment") || undefined;
      const r = await walletApi.verifyDeposit(depositRef, hint);
      if (r?.deposit) setDeposit(r.deposit);
    } catch (e) {
      setDepositErr(e?.message || "Could not confirm the payment");
    } finally {
      setVerifying(false);
    }
  };

  const hasFilters = Boolean(q || type || status || from || to);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-white">Transactions</h2>
          <p className="mt-1 text-xs text-white/50">Real-money ledger — deposits, refunds and adjustments.</p>
        </div>
        <Link to="/wallet" className="text-xs text-cyan-300 hover:text-cyan-200">← Back to wallet</Link>
      </div>

      {/* Deposit detail (opened from checkout return / pending list) */}
      {depositRef ? (
        <Panel
          title={`Deposit ${depositRef}`}
          desc="Shown from the server — the return URL is never proof of payment."
          actions={<button onClick={closeDeposit} className="text-xs text-white/50 hover:text-white">Close</button>}
        >
          {depositErr ? <Card error={depositErr} /> : !deposit ? <LoadingState rows={2} /> : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={DEPOSIT_STATUS[deposit.status]?.tone || "default"}>{DEPOSIT_STATUS[deposit.status]?.label || deposit.status}</Badge>
                <span className="text-lg font-semibold tabular-nums text-white">{fmtMinor(deposit.amountMinor, deposit.currency)}</span>
                <span className="font-mono text-[11px] text-white/40">{deposit.providerPaymentId || "no provider payment id yet"}</span>
                <span className="ml-auto text-[11px] text-white/40">
                  Created {new Date(deposit.createdAt).toLocaleString()}
                  {deposit.paidAt ? ` · Confirmed ${new Date(deposit.paidAt).toLocaleString()}` : ""}
                </span>
              </div>
              <div className="grid gap-2 text-xs text-white/60 sm:grid-cols-3">
                <div><span className="text-white/40">Status</span><p className="text-white/80">{DEPOSIT_STATUS[deposit.status]?.label || deposit.status}</p></div>
                <div><span className="text-white/40">Provider</span><p className="text-white/80">{deposit.providerLabel} · {deposit.environment}</p></div>
                <div><span className="text-white/40">Reference</span><p className="font-mono text-white/80">{deposit.reference}</p></div>
              </div>
              {deposit.failureReason ? <p className="text-xs text-rose-400">{deposit.failureReason}</p> : null}

              {!deposit.terminal ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" loading={verifying} onClick={runVerify}>
                    {!verifying && <CheckCircle2 className="h-4 w-4" />} Check payment status
                  </Button>
                  <span className="text-[11px] text-white/40">We confirm with the payment provider — nothing is credited until it does.</span>
                </div>
              ) : deposit.status === "paid" ? (
                <p className="text-xs text-emerald-400">Confirmed and credited to your available balance.</p>
              ) : null}
            </div>
          )}
        </Panel>
      ) : null}

      {/* Filters */}
      <Panel title="Search & filter">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Reference">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="DEP-2026-…" className="pl-8" />
            </div>
          </FormField>
          <FormField label="Type">
            <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-[#0b0f1a]">{o.label}</option>)}
            </select>
          </FormField>
          <FormField label="From">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </FormField>
          <FormField label="To">
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </FormField>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-full overflow-x-auto">
            <Segmented ariaLabel="status" size="sm" items={STATUS_OPTIONS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          </div>
          {hasFilters ? (
            <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setQ(""); setType(""); setStatus(""); setFrom(""); setTo(""); setPage(1); }}>
              <RefreshCw className="h-3.5 w-3.5" /> Clear filters
            </Button>
          ) : null}
        </div>
      </Panel>

      {/* List */}
      <Panel title={`${total} transaction${total === 1 ? "" : "s"}`} desc="Newest first">
        {error ? <Card error={error} /> : rows === null ? <LoadingState rows={4} /> : rows.length === 0 ? (
          <EmptyState title={hasFilters ? "No matching transactions" : "No transactions yet"} desc={hasFilters ? "Try clearing or widening your filters." : "Confirmed deposits and adjustments will appear here."} />
        ) : (
          <>
            <ul className="space-y-1.5">
              {rows.map((t) => {
                const meta = LEDGER_TYPE[t.type] || { label: t.type, sign: "", tone: "default" };
                const signed = t.direction === "debit" ? -t.amountMinor : (t.direction === "credit" ? t.amountMinor : 0);
                return (
                  <li key={t._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs hover:border-white/15">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className={`tabular-nums font-medium ${signed > 0 ? "text-emerald-400" : signed < 0 ? "text-rose-400" : "text-white/70"}`}>
                      {signed !== 0 ? `${signed > 0 ? "+" : ""}${fmtMinor(signed, t.currency)}` : fmtMinor(t.amountMinor, t.currency)}
                    </span>
                    <span className="font-mono text-[11px] text-white/40">{t.reference || "—"}</span>
                    {t.status && t.status !== "confirmed" ? <Badge tone={t.status === "pending" ? "warning" : "danger"}>{t.status}</Badge> : null}
                    <span className="ml-auto text-white/35">{new Date(t.createdAt).toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
            {pages > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-xs text-white/50">Page {page} of {pages}</span>
                <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
}
