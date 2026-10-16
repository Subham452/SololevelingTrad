import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Undo2, Wallet } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { fmtMinor } from "../../lib/wallet.js";
import { useAuth } from "../../context/useAuth.js";
import { Badge, Button, Panel } from "../../components/ui.jsx";
import {
  ConfirmDialog, DataTable, DateRangePresets, PageHeader, Pagination, QueryState,
  RefreshButton, SearchInput, SelectFilter, StatCard,
} from "../../components/admin/primitives.jsx";
import { fmtDate, fmtNum } from "../../components/admin/format.js";

const DEPOSIT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "expired", label: "Expired" },
  { value: "refunded", label: "Refunded" },
];
const WEBHOOK_STATUS_OPTIONS = [
  { value: "", label: "All deliveries" },
  { value: "processed", label: "Processed" },
  { value: "unmatched", label: "Unmatched (need reconciliation)" },
  { value: "failed", label: "Failed" },
  { value: "ignored", label: "Ignored" },
  { value: "received", label: "Received" },
];
const TABS = [
  { value: "overview", label: "Overview" },
  { value: "deposits", label: "Deposits" },
  { value: "ledger", label: "Ledger" },
  { value: "webhooks", label: "Webhooks" },
];

// Mirrors backend permissions (the server still enforces every action).
const REFUND_ROLES = ["superadmin", "finance"];
const ADJUST_ROLES = ["superadmin"];

// ---------------------------------------------------------------------------
// Wallet & Deposits — real-money operations.
//
// There is deliberately no "mark as paid" control anywhere on this page: money
// only ever moves from a verified provider webhook or a server-side provider
// lookup. Refunds and balance corrections are audited, permission-gated
// operations with a mandatory reason.
// ---------------------------------------------------------------------------
export default function AdminWallet() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState("overview");

  const [overview, setOverview] = useState(null);
  const [config, setConfig] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [recon, setRecon] = useState(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [range, setRange] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  // Bumped by the refresh/retry controls so the effect below refetches even
  // when the filter values themselves are unchanged.
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [listErr, setListErr] = useState("");
  const [listLoading, setListLoading] = useState(false);

  const [refundTarget, setRefundTarget] = useState(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ userId: "", amountMinor: "", reason: "", evidenceRef: "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const flash = (msg, ok = true) => setToast({ msg, ok });
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const loadOverview = useCallback(() => {
    setLoading(true); setErr("");
    Promise.all([adminApi.walletOverview(), adminApi.walletConfig()])
      .then(([o, c]) => { setOverview(o); setConfig(c); })
      .catch((e) => setErr(e?.message || "Failed to load wallet overview"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  // Secondary tabs fetch only when opened, so the default view stays fast.
  useEffect(() => {
    if (tab === "overview") return undefined;
    setListLoading(true); setListErr("");
    const params = { page, limit, from: range?.from, to: range?.to };
    if (q) params.q = q;
    const req =
      tab === "deposits" ? adminApi.walletDeposits({ ...params, status })
        : tab === "ledger" ? adminApi.walletTransactions(params)
          : adminApi.walletWebhooks({ ...params, status });
    req
      .then((d) => { setRows(d?.items || []); setTotal(d?.total || 0); setPages(d?.pages || 1); })
      .catch((e) => { setRows([]); setListErr(e?.message || "Failed to load"); })
      .finally(() => setListLoading(false));
    return undefined;
  }, [tab, page, limit, q, status, range, tick]);

  useEffect(() => { setPage(1); }, [tab, q, status, range]);

  const runReconciliation = () => {
    setBusy(true);
    adminApi.walletReconcile()
      .then((r) => { setRecon(r); flash(r?.mismatches?.length ? `${r.mismatches.length} account(s) disagree with their ledger` : `${r.checked} account(s) reconciled — all match`, !r?.mismatches?.length); })
      .catch((e) => flash(e?.message || "Reconciliation failed", false))
      .finally(() => setBusy(false));
  };

  const doRefund = async () => {
    setBusy(true);
    try {
      const r = await adminApi.walletRefund(refundTarget.reference, reason);
      flash(r?.alreadyRefunded ? "Already refunded — provider was not called again" : `Refunded ${fmtMinor(refundTarget.amountMinor, refundTarget.currency)} for ${refundTarget.reference}`);
      setRefundTarget(null); setReason("");
      loadOverview();
    } catch (e) {
      // Never pretends success: a provider rejection leaves the status unchanged.
      flash(e?.message || "Refund failed", false);
    } finally { setBusy(false); }
  };

  const doAdjust = async () => {
    setBusy(true);
    try {
      const payload = { ...adjustForm, amountMinor: Number(adjustForm.amountMinor) };
      if (!payload.evidenceRef) delete payload.evidenceRef;
      await adminApi.walletAdjust(payload);
      flash(`Adjustment of ${fmtMinor(Number(adjustForm.amountMinor), "USD")} applied and audited`);
      setAdjustOpen(false);
      setAdjustForm({ userId: "", amountMinor: "", reason: "", evidenceRef: "" });
      loadOverview();
    } catch (e) {
      flash(e?.message || "Adjustment rejected", false);
    } finally { setBusy(false); }
  };

  const canRefund = REFUND_ROLES.includes(me?.role);
  const canAdjust = ADJUST_ROLES.includes(me?.role);

  const depositColumns = [
    { key: "reference", header: "Reference", sortable: false, render: (r) => <span className="font-mono text-xs text-white/70">{r.reference}</span> },
    { key: "amount", header: "Amount", sortable: false, render: (r) => <span className="tabular-nums">{fmtMinor(r.amountMinor, r.currency)}</span> },
    { key: "user", header: "User", sortable: false, render: (r) => <span className="text-xs text-white/60">{r.userId?.email || r.userId?.name || "—"}</span> },
    { key: "status", header: "Status", sortable: false, render: (r) => <Badge tone={r.status === "paid" ? "success" : r.status === "pending" ? "warning" : r.status === "failed" ? "danger" : "default"}>{r.status}</Badge> },
    { key: "providerPaymentId", header: "Provider payment", sortable: false, render: (r) => <span className="font-mono text-[11px] text-white/45">{r.providerPaymentId || "—"}</span> },
    { key: "createdAt", header: "Created", sortable: false, render: (r) => <span className="text-xs text-white/55">{fmtDate(r.createdAt)}</span> },
    {
      key: "actions", header: "", sortable: false,
      render: (r) => (canRefund && r.status === "paid" ? (
        <Button size="sm" variant="ghost" onClick={() => setRefundTarget(r)}><Undo2 className="h-3.5 w-3.5" /> Refund</Button>
      ) : null),
    },
  ];
  const ledgerColumns = [
    { key: "type", header: "Type", sortable: false, render: (r) => <Badge tone={r.direction === "credit" ? "success" : r.direction === "debit" ? "danger" : "default"}>{r.type}</Badge> },
    { key: "amount", header: "Amount", sortable: false, render: (r) => <span className={`tabular-nums ${r.direction === "credit" ? "text-emerald-400" : r.direction === "debit" ? "text-rose-400" : ""}`}>{fmtMinor(r.amountMinor, r.currency)}</span> },
    { key: "balance", header: "Balance after", sortable: false, render: (r) => <span className="tabular-nums text-white/70">{fmtMinor(r.availableAfterMinor, r.currency)}</span> },
    { key: "reference", header: "Reference", sortable: false, render: (r) => <span className="font-mono text-xs text-white/60">{r.reference || "—"}</span> },
    { key: "user", header: "User", sortable: false, render: (r) => <span className="text-xs text-white/60">{r.userId?.email || "—"}</span> },
    { key: "createdAt", header: "When", sortable: false, render: (r) => <span className="text-xs text-white/55">{fmtDate(r.createdAt)}</span> },
  ];
  const webhookColumns = [
    { key: "type", header: "Event", sortable: false, render: (r) => <span className="text-xs text-white/80">{r.type}</span> },
    { key: "status", header: "Result", sortable: false, render: (r) => <Badge tone={r.status === "processed" ? "success" : r.status === "failed" ? "danger" : r.status === "unmatched" ? "warning" : "default"}>{r.status}</Badge> },
    { key: "depositReference", header: "Deposit", sortable: false, render: (r) => <span className="font-mono text-[11px] text-white/55">{r.depositReference || "—"}</span> },
    { key: "eventId", header: "Event id", sortable: false, render: (r) => <span className="font-mono text-[11px] text-white/40">{r.eventId}</span> },
    { key: "error", header: "Error", sortable: false, render: (r) => <span className="text-[11px] text-rose-400">{r.error || "—"}</span> },
    { key: "createdAt", header: "Received", sortable: false, render: (r) => <span className="text-xs text-white/55">{fmtDate(r.createdAt)}</span> },
  ];

  const listColumns = tab === "deposits" ? depositColumns : tab === "ledger" ? ledgerColumns : webhookColumns;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Wallet & Deposits"
        desc="Real-money balances, deposits, the immutable ledger and Whop webhook health."
        actions={(
          <div className="flex items-center gap-2">
            <RefreshButton onClick={loadOverview} loading={loading} />
            {canAdjust ? <Button size="sm" variant="secondary" onClick={() => setAdjustOpen(true)}>Adjust balance</Button> : null}
          </div>
        )}
      />

      {toast ? (
        <div role="status" aria-live="polite" className={`rounded-lg border px-3 py-2 text-xs ${toast.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>
          {toast.msg}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1" role="tablist" aria-label="Wallet sections">
        {TABS.map((t) => (
          <button
            key={t.value} role="tab" aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${tab === t.value ? "bg-white/10 text-white" : "text-white/55 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <QueryState loading={loading} error={err} onRetry={loadOverview} rows={3} empty={!overview} emptyTitle="No data" />
          {overview ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Pending deposits" value={fmtNum(overview.deposits.pendingCount)} sub={fmtMinor(overview.deposits.pendingMinor, "USD")} tone="amber" icon={Wallet} />
                <StatCard label="Confirmed (all time)" value={fmtNum(overview.deposits.totalPaidCount)} sub={fmtMinor(overview.deposits.totalPaidMinor, "USD")} tone="green" icon={CheckCircle2} />
                <StatCard label="Failed / refunded" value={`${fmtNum(overview.deposits.failedCount)} / ${fmtNum(overview.deposits.refundedCount)}`} tone="red" icon={Undo2} />
                <StatCard label="Ledger check" value={overview.reconciliation.healthy === overview.reconciliation.checked ? "All match" : `${overview.reconciliation.mismatches.length} mismatched`} sub={`${fmtNum(overview.reconciliation.checked)} accounts replayed`} tone={overview.reconciliation.mismatches.length ? "red" : "green"} icon={CheckCircle2} />
              </div>

              {/* Alerts — suspicious activity + reconciliation discrepancies */}
              <Panel title="Alerts" desc="Conservative signals; nothing is auto-corrected.">
                {overview.alerts.length === 0 ? (
                  <p className="text-xs text-white/50">No alerts. Ledger, webhooks and deposits are consistent.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {overview.alerts.map((a) => (
                      <li key={a} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" loading={busy} onClick={runReconciliation}>
                    <RefreshCw className="h-3.5 w-3.5" /> Run reconciliation
                  </Button>
                </div>
                {recon ? (
                  <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${recon.mismatches.length ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>
                    Checked {fmtNum(recon.checked)} · healthy {fmtNum(recon.healthy)}
                    {recon.mismatches.length ? ` · ${recon.mismatches.length} need review` : ""}
                    {recon.mismatches.length ? (
                      <ul className="mt-1.5 list-disc pl-4 text-[11px]">
                        {recon.mismatches.slice(0, 5).map((m) => (
                          <li key={m.userId}>{m.userId}: expected {fmtMinor(m.expectedAvailableMinor, "USD")} / actual {fmtMinor(m.actualAvailableMinor, "USD")}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </Panel>

              {/* Provider configuration — presence + mode, never secrets */}
              <Panel title="Payment provider" desc="Presence and mode only — no credentials are ever displayed or stored client-side.">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                  <div><span className="text-white/40">Provider</span><p className="text-white/85">{overview.provider.label}</p></div>
                  <div><span className="text-white/40">Mode</span><p className="text-white/85">{overview.provider.environment}{overview.provider.sandbox ? " (sandbox)" : ""}</p></div>
                  <div><span className="text-white/40">Credentials</span><p className="text-white/85">{overview.provider.configured ? "Configured" : "Missing"}</p></div>
                  <div><span className="text-white/40">Webhook secret</span><p className="text-white/85">{overview.provider.webhookConfigured ? "Configured" : "Missing"}</p></div>
                  <div><span className="text-white/40">Subscribed events</span><p className="text-white/70">{overview.provider.subscribedEvents.join(", ")}</p></div>
                  <div><span className="text-white/40">Checkout links</span><p className="text-white/85">{overview.presets.length} preset(s)</p></div>
                </div>
                {config?.liveBlockers?.length ? (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-xs font-medium text-amber-200">Before live mode</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-amber-100/75">
                      {config.liveBlockers.map((b) => <li key={b}>{b}</li>)}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-emerald-400">No configuration blockers detected.</p>
                )}
              </Panel>

              <Panel title="Note on marking payments" desc="Deliberate design limit.">
                <p className="text-xs text-white/55">
                  There is no action on this page that can mark an arbitrary deposit as paid. Deposits are only credited by a
                  signature-verified webhook from Whop or by a server-to-server lookup against Whop. That prevents an admin
                  (or a compromised admin session) from minting funds that were never received.
                </p>
              </Panel>
            </>
          ) : null}
        </div>
      ) : (
        <Panel
          title={tab === "deposits" ? "Deposits" : tab === "ledger" ? "Ledger entries" : "Whop webhook deliveries"}
          desc={tab === "deposits" ? "Search by user, reference or provider payment id" : tab === "ledger" ? "Append-only — corrections appear as new rows" : "At-least-once delivery with exactly-once processing"}
        >
          <div className="flex flex-wrap items-end gap-3 border-b border-white/[0.07] p-3">
            <SearchInput value={q} onChange={setQ} placeholder={tab === "deposits" ? "Reference, payment id or user id" : "Reference"} ariaLabel="Search" />
            {tab !== "ledger" ? <SelectFilter label="Status" value={status} onChange={setStatus} options={tab === "deposits" ? DEPOSIT_STATUS_OPTIONS : WEBHOOK_STATUS_OPTIONS} /> : null}
            <DateRangePresets value={range} onChange={setRange} />
            <RefreshButton onClick={() => { setPage(1); setTick((t) => t + 1); }} loading={listLoading} />
          </div>

          <QueryState
            loading={listLoading}
            error={listErr}
            empty={!rows?.length}
            onRetry={() => setTick((t) => t + 1)}
            rows={5}
            emptyTitle="Nothing here"
            emptyDesc="No records match the current filters."
          />
          {rows?.length ? (
            <DataTable columns={listColumns} rows={rows} rowKey="_id" />
          ) : null}
          <Pagination page={page} pages={pages} total={total} onPage={setPage} limit={limit} onLimit={(n) => { setLimit(n); setPage(1); }} loading={listLoading} />
        </Panel>
      )}

      <ConfirmDialog
        open={!!refundTarget}
        title="Refund deposit"
        description={refundTarget ? `Provider refund of ${fmtMinor(refundTarget.amountMinor, refundTarget.currency)} for ${refundTarget.reference}. The payment provider is refunded first; a reversal ledger entry is only written if that succeeds.` : ""}
        confirmLabel="Refund via provider"
        tone="danger"
        requireReason
        reason={reason}
        onReasonChange={setReason}
        loading={busy}
        onConfirm={doRefund}
        onCancel={() => { setRefundTarget(null); setReason(""); }}
      />

      <ConfirmDialog
        open={adjustOpen}
        title="Adjust balance"
        description="Writes an immutable, audited ledger entry. It never edits history and can never make a balance negative."
        confirmLabel="Apply adjustment"
        tone="danger"
        loading={busy}
        onConfirm={doAdjust}
        onCancel={() => setAdjustOpen(false)}
        reasonLabel="Reason (required, min 10 chars)"
        reasonPlaceholder="Why is this correction warranted?"
        reason={adjustForm.reason}
        onReasonChange={(v) => setAdjustForm((f) => ({ ...f, reason: v }))}
      >
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-white/60">User id (required)</span>
            <input
              value={adjustForm.userId} onChange={(e) => setAdjustForm((f) => ({ ...f, userId: e.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              placeholder="64-char ObjectId" disabled={busy}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-white/60">Amount in minor units (negative to debit)</span>
            <input
              type="number" value={adjustForm.amountMinor}
              onChange={(e) => setAdjustForm((f) => ({ ...f, amountMinor: e.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm tabular-nums text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              placeholder="e.g. 2500 or -2500" disabled={busy}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-white/60">Evidence reference{Number(adjustForm.amountMinor) > 0 ? " (required for credits)" : " (optional)"}</span>
            <input
              value={adjustForm.evidenceRef}
              onChange={(e) => setAdjustForm((f) => ({ ...f, evidenceRef: e.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              placeholder="Provider payment id or case reference" disabled={busy}
            />
          </label>
        </div>
      </ConfirmDialog>
    </div>
  );
}
