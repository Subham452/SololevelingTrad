import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Phone, PhoneMissed, Radio, PhoneOff, Users } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { Badge, Button, Panel, Segmented } from "../../components/ui.jsx";
import { ConfirmDialog, DataTable, DateRangePresets, PageHeader, Pagination, QueryState, RefreshButton, SelectFilter, StatusPill } from "../../components/admin/primitives.jsx";
import { fmtDate, fmtDuration, fmtNum } from "../../components/admin/format.js";

const CALL_STATUS = [
  { value: "ringing", label: "Ringing" },
  { value: "accepted", label: "Accepted" },
  { value: "ended", label: "Ended" },
  { value: "missed", label: "Missed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
];
const LIVE_STATUS = [
  { value: "live", label: "Live" },
  { value: "scheduled", label: "Scheduled" },
  { value: "ended", label: "Ended" },
  { value: "cancelled", label: "Cancelled" },
];

export default function AdminCalls() {
  const [view, setView] = useState("calls");
  const [status, setStatus] = useState("");
  const [range, setRange] = useState(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState(null);

  const [endTarget, setEndTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const flash = (msg, ok = true) => setToast({ msg, ok });
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(() => {
    setLoading(true); setErr("");
    const params = { status, from: range?.from, to: range?.to, page, limit: 25 };
    const call = view === "calls" ? adminApi.calls(params) : adminApi.lives(params);
    call
      .then(setData)
      .catch((e) => setErr(e?.message || "Failed to load records"))
      .finally(() => setLoading(false));
  }, [view, status, range, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [view, status, range]);

  const endLive = async () => {
    setBusy(true);
    try {
      await adminApi.endLive(endTarget._id, reason);
      flash("Live session ended and provider room deactivated");
      setEndTarget(null); setReason("");
      load();
    } catch (e) { flash(e?.message || "Could not end the session", false); } finally { setBusy(false); }
  };

  const rows = data?.items || [];

  const callStatusIcon = (s) => {
    if (s === "ended" || s === "accepted") return <Phone className="h-3.5 w-3.5 text-emerald-400" />;
    if (s === "missed" || s === "rejected") return <PhoneMissed className="h-3.5 w-3.5 text-rose-400" />;
    if (s === "failed" || s === "cancelled") return <PhoneOff className="h-3.5 w-3.5 text-amber-400" />;
    return <Phone className="h-3.5 w-3.5 text-cyan-300" />;
  };

  const callCols = [
    {
      key: "initiatorId", header: "Initiator",
      render: (c) => (c.initiatorId
        ? <span className="block max-w-[15rem] truncate text-sm text-white/80">{c.initiatorId.email}</span>
        : <span className="text-xs text-white/40">—</span>),
    },
    { key: "type", header: "Type", render: (c) => <Badge tone={c.type === "video" ? "accent" : "default"}>{c.type}</Badge> },
    {
      key: "status", header: "Status",
      render: (c) => <span className="inline-flex items-center gap-1.5">{callStatusIcon(c.status)}<StatusPill status={c.status} /></span>,
    },
    { key: "durationSeconds", header: "Duration", render: (c) => <span className="num text-xs text-white/60">{fmtDuration(c.durationSeconds)}</span> },
    { key: "providerRoomId", header: "Room", render: (c) => <span className="num text-xs text-white/40">{c.providerRoomId || "—"}</span> },
    { key: "createdAt", header: "Started", render: (c) => <span className="text-xs text-white/45">{fmtDate(c.createdAt)}</span> },
  ];

  const liveCols = [
    {
      key: "hostId", header: "Host",
      render: (l) => (l.hostId
        ? <Link to={`/admin/users/${l.hostId._id}`} className="block max-w-[15rem] truncate text-sm text-white/80 hover:text-cyan-300" onClick={(e) => e.stopPropagation()}>{l.hostId.email}</Link>
        : <span className="text-xs text-white/40">—</span>),
    },
    { key: "title", header: "Title", render: (l) => <span className="block max-w-[16rem] truncate text-sm text-white/85">{l.title || "Untitled"}</span> },
    { key: "status", header: "Status", render: (l) => <StatusPill status={l.status} /> },
    { key: "viewerCount", header: "Viewers", render: (l) => <span className="num text-xs text-white/60">{fmtNum(l.viewerCount || 0)}</span> },
    { key: "category", header: "Category", render: (l) => <span className="text-xs text-white/50">{l.category || "—"}</span> },
    { key: "startedAt", header: "Started", render: (l) => <span className="text-xs text-white/45">{fmtDate(l.startedAt || l.createdAt)}</span> },
    {
      key: "_actions", header: "", sortable: false, cellClassName: "text-right",
      render: (l) => (l.status === "live" ? (
        <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setReason(""); setEndTarget(l); }}>
          <PhoneOff className="h-3.5 w-3.5" /> End
        </Button>
      ) : null),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Calls & live sessions"
        desc="Real VideoSDK-backed call records and live broadcast metadata. Ending a live session deactivates the provider room."
        actions={<RefreshButton onClick={load} loading={loading} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Record type"
          value={view} onChange={setView}
          items={[
            { value: "calls", label: "Calls" },
            { value: "lives", label: "Live sessions" },
          ]}
        />
        <SelectFilter
          label={view === "calls" ? "Status" : "Status"}
          value={status} onChange={setStatus}
          options={view === "calls" ? CALL_STATUS : LIVE_STATUS}
        />
      </div>

      <DateRangePresets value={range} onChange={setRange} className="mb-4" />

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <QueryState
          loading={loading && !data} error={err} onRetry={load} rows={5}
          empty={!loading && !err && rows.length === 0}
          emptyTitle={view === "calls" ? "No calls match these filters" : "No live sessions match these filters"}
          emptyDesc="Calls are created when a user starts one — invite a user from their profile to see one here."
        />
        {rows.length > 0 && (
          <>
            <DataTable columns={view === "calls" ? callCols : liveCols} rows={rows} />
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} loading={loading} />
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Support call invitations" desc="Reach a user with a real call">
          <ol className="list-decimal space-y-1.5 pl-5 text-xs text-white/55">
            <li>Open the user in <Link to="/admin/users" className="text-cyan-300 hover:text-cyan-200">Users</Link>.</li>
            <li>Press <span className="text-white/80">Call</span> — this creates/finds the direct conversation and starts a ringing call.</li>
            <li>The user receives the standard incoming-call prompt and must accept or decline.</li>
            <li>Status, duration and the provider room id appear in this table.</li>
          </ol>
        </Panel>
        <Panel title="Live session moderation" desc="Platform-level control">
          <p className="text-xs text-white/55">
            <Radio className="mr-1.5 inline h-3.5 w-3.5 text-violet-300" aria-hidden />
            Ending a live session marks it <span className="text-white/80">ended</span>, zeroes the viewer count, best-effort deactivates the VideoSDK room, and writes a moderation action plus audit entry.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/35">
            <Users className="h-3 w-3" aria-hidden />
            Calls and lives only exist once real users create them — this table is never mocked.
          </p>
        </Panel>
      </div>

      <ConfirmDialog
        open={!!endTarget}
        title={`End “${endTarget?.title || "live session"}”?`}
        description="Viewers are disconnected immediately and the provider room is deactivated. This cannot be undone."
        confirmLabel="End session"
        loading={busy}
        reason={reason}
        onReasonChange={setReason}
        reasonLabel="Moderation reason"
        onCancel={() => { if (!busy) { setEndTarget(null); setReason(""); } }}
        onConfirm={endLive}
      />

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
