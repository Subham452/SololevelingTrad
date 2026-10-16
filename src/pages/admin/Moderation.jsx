import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, Inbox } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { Badge, Button, Panel, Segmented } from "../../components/ui.jsx";
import { ConfirmDialog, DataTable, PageHeader, Pagination, QueryState, RefreshButton, SelectFilter } from "../../components/admin/primitives.jsx";
import { fmtDate } from "../../components/admin/format.js";

const TYPE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "message", label: "Message" },
  { value: "conversation", label: "Conversation" },
];

export default function AdminModeration() {
  const [status, setStatus] = useState("open");
  const [targetType, setTargetType] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);

  const [resolveTarget, setResolveTarget] = useState(null);
  const [decision, setDecision] = useState("resolved");
  const [actionTaken, setActionTaken] = useState("");
  const [busy, setBusy] = useState(false);

  const flash = (msg, ok = true) => setToast({ msg, ok });
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(() => {
    setLoading(true); setErr("");
    adminApi.reports({ status, targetType, page, limit: 25 })
      .then(setData)
      .catch((e) => setErr(e?.message || "Failed to load reports"))
      .finally(() => setLoading(false));
  }, [status, targetType, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, targetType]);

  const resolve = async () => {
    setBusy(true);
    try {
      await adminApi.resolveReport(resolveTarget._id, decision, actionTaken);
      flash(`Report ${decision}`);
      setResolveTarget(null); setActionTaken("");
      load();
    } catch (e) { flash(e?.message || "Action failed", false); } finally { setBusy(false); }
  };

  const rows = data?.items || [];

  const toneFor = (r) => (r.status === "open" ? "danger" : r.status === "reviewing" ? "warning" : r.status === "resolved" ? "success" : "default");

  return (
    <div>
      <PageHeader
        title="Moderation"
        desc="Community reports queue. Every decision is written to the moderation log and the admin audit trail."
        actions={<RefreshButton onClick={load} loading={loading} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Report status"
          value={status} onChange={setStatus}
          items={[
            { value: "open", label: "Open" },
            { value: "reviewing", label: "Reviewing" },
            { value: "resolved", label: "Resolved" },
            { value: "dismissed", label: "Dismissed" },
            { value: "", label: "All" },
          ]}
        />
        <SelectFilter label="Target" value={targetType} onChange={setTargetType} options={TYPE_OPTIONS} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <QueryState
          loading={loading && !data} error={err} onRetry={load} rows={5}
          empty={!loading && !err && rows.length === 0}
          emptyTitle={status === "open" ? "No open reports" : "No reports match these filters"}
          emptyDesc="Reports filed by community members will appear here."
        />
        {rows.length > 0 && (
          <>
            <DataTable
              columns={[
                {
                  key: "reporterId", header: "Reporter",
                  render: (r) => <span className="block max-w-[14rem] truncate text-xs text-white/70">{r.reporterId?.email || "unknown"}</span>,
                },
                { key: "targetType", header: "Against", render: (r) => <Badge>{r.targetType}</Badge> },
                {
                  key: "reason", header: "Reason",
                  render: (r) => (
                    <div className="min-w-0">
                      <p className="text-sm text-white/85">{r.reason}</p>
                      {r.details && <p className="mt-0.5 line-clamp-2 text-xs text-white/45">{r.details}</p>}
                    </div>
                  ),
                },
                { key: "status", header: "Status", render: (r) => <Badge tone={toneFor(r)}>{r.status}</Badge> },
                { key: "actionTaken", header: "Action", render: (r) => <span className="text-xs text-white/50">{r.actionTaken || "—"}</span> },
                { key: "createdAt", header: "Filed", render: (r) => <span className="text-xs text-white/45">{fmtDate(r.createdAt)}</span> },
                {
                  key: "_actions", header: "", sortable: false, cellClassName: "text-right",
                  render: (r) => (["open", "reviewing"].includes(r.status) ? (
                    <Button
                      variant="secondary" size="sm"
                      onClick={(e) => { e.stopPropagation(); setDecision("resolved"); setActionTaken(""); setResolveTarget(r); }}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> Decide
                    </Button>
                  ) : null),
                },
              ]}
              rows={rows} rowKey="_id"
            />
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} loading={loading} />
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Panel title="Resolve" desc="Take action on the reported content">
          <p className="flex items-start gap-2 text-xs text-white/55">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
            Mark the report resolved and describe the action (message removed, warning issued, user suspended…). The note is stored on the report.
          </p>
        </Panel>
        <Panel title="Dismiss" desc="No violation found">
          <p className="flex items-start gap-2 text-xs text-white/55">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
            Dismissing keeps the report history intact without action against the target.
          </p>
        </Panel>
        <Panel title="Escalate" desc="Needs another review">
          <p className="flex items-start gap-2 text-xs text-white/55">
            <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden />
            Move to <span className="text-white/80">reviewing</span> to signal a pending decision; the queue stays searchable by status.
          </p>
        </Panel>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35">
        <Inbox className="h-3 w-3" aria-hidden />
        Reports are created by community members in the product. An empty queue means nothing has been reported.
      </p>

      <ConfirmDialog
        open={!!resolveTarget}
        title="Record moderation decision"
        description={`Report: ${resolveTarget?.reason} — ${resolveTarget?.details || "no extra details"}.`}
        confirmLabel="Save decision"
        tone={decision === "dismissed" ? "primary" : "danger"}
        loading={busy}
        reason={actionTaken}
        onReasonChange={setActionTaken}
        reasonLabel="Action taken"
        reasonPlaceholder="e.g. Message removed, warning sent to user"
        onCancel={() => { if (!busy) { setResolveTarget(null); setActionTaken(""); } }}
        onConfirm={resolve}
      >
        <div className="mt-4">
          <Segmented
            ariaLabel="Decision"
            value={decision} onChange={setDecision}
            items={[
              { value: "resolved", label: "Resolve" },
              { value: "reviewing", label: "Keep reviewing" },
              { value: "dismissed", label: "Dismiss" },
            ]}
          />
        </div>
      </ConfirmDialog>

      {toast && (
        <div
          role="status" aria-live="polite"
          className={`fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full border px-4 py-2 text-sm backdrop-blur-xl ${toast.ok ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-rose-500/40 bg-rose-500/15 text-rose-200"}`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
