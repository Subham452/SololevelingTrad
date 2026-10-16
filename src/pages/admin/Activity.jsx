import { useCallback, useEffect, useState } from "react";
import { Activity as ActivityIcon, ScrollText } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { Badge, Panel, Segmented } from "../../components/ui.jsx";
import { DataTable, DateRangePresets, PageHeader, Pagination, QueryState, RefreshButton, SearchInput } from "../../components/admin/primitives.jsx";
import { fmtDate } from "../../components/admin/format.js";

export default function AdminActivity() {
  const [view, setView] = useState("activity");
  const [q, setQ] = useState("");
  const [range, setRange] = useState(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setLoading(true); setErr("");
    const params = { q: q || undefined, action: q || undefined, from: range?.from, to: range?.to, page, limit };
    const call = view === "activity" ? adminApi.activity(params) : adminApi.audit(params);
    call
      .then(setData)
      .catch((e) => setErr(e?.message || "Failed to load log"))
      .finally(() => setLoading(false));
  }, [view, q, range, page, limit]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [view, q, range]);

  const rows = data?.items || [];

  const activityCols = [
    { key: "action", header: "Event", render: (a) => <span className="text-sm text-white/85">{a.action}</span> },
    {
      key: "userId", header: "User",
      render: (a) => (a.userId
        ? <span className="block max-w-[16rem] truncate text-xs text-cyan-300/80">{a.userId.email}</span>
        : <span className="text-xs text-white/35">system</span>),
    },
    {
      key: "meta", header: "Detail",
      render: (a) => <span className="block max-w-[20rem] truncate text-xs text-white/45">{a.meta ? JSON.stringify(a.meta) : "—"}</span>,
    },
    { key: "ip", header: "IP", render: (a) => <span className="num text-xs text-white/40">{a.ip || "—"}</span> },
    { key: "createdAt", header: "When", render: (a) => <span className="text-xs text-white/45">{fmtDate(a.createdAt)}</span> },
  ];

  const auditCols = [
    { key: "action", header: "Action", render: (a) => <Badge tone="accent">{a.action}</Badge> },
    {
      key: "actorId", header: "Actor",
      render: (a) => (a.actorId
        ? <span className="block max-w-[16rem] truncate text-xs text-white/70">{a.actorId.email} <span className="text-white/35">· {a.actorId.role}</span></span>
        : <span className="text-xs text-white/35">system</span>),
    },
    { key: "target", header: "Target", render: (a) => <span className="num text-xs text-white/45">{a.target ? String(a.target).slice(0, 12) : "—"}</span> },
    {
      key: "meta", header: "Meta",
      render: (a) => <span className="block max-w-[22rem] truncate text-xs text-white/45">{a.meta ? JSON.stringify(a.meta) : "—"}</span>,
    },
    { key: "createdAt", header: "When", render: (a) => <span className="text-xs text-white/45">{fmtDate(a.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={view === "activity" ? "Activity log" : "Audit log"}
        desc={view === "activity"
          ? "User and system events. Search by event name (e.g. login, purchase)."
          : "Administrative changes — who did what, to which record, with what reason."}
        actions={<RefreshButton onClick={load} loading={loading} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Log type"
          value={view}
          onChange={setView}
          items={[
            { value: "activity", label: "User activity" },
            { value: "audit", label: "Admin audit" },
          ]}
        />
        <SearchInput
          value={q} onChange={setQ}
          placeholder={view === "activity" ? "Filter by event name…" : "Filter by admin action…"}
          className="w-full sm:w-72"
          ariaLabel="Filter log entries"
        />
      </div>

      <DateRangePresets value={range} onChange={setRange} className="mb-4" />

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <QueryState
          loading={loading && !data} error={err} onRetry={load} rows={6}
          empty={!loading && !err && rows.length === 0}
          emptyTitle="No log entries match these filters"
          emptyDesc="Try a different event name or a wider date range."
        />
        {rows.length > 0 && (
          <>
            <DataTable columns={view === "activity" ? activityCols : auditCols} rows={rows} />
            <Pagination page={data?.page} pages={data?.pages} total={data?.total} onPage={setPage} limit={limit} onLimit={setLimit} loading={loading} />
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Panel title="About the activity log" desc="Operational events">
          <p className="flex items-start gap-2 text-xs text-white/55">
            <ActivityIcon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden />
            Records sign-ins, purchases, subscription changes and admin interventions against a user. Written by the backend on every meaningful event.
          </p>
        </Panel>
        <Panel title="About the audit log" desc="Administrative accountability">
          <p className="flex items-start gap-2 text-xs text-white/55">
            <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
            Records every privileged admin action including refunds, role changes, bans and moderation decisions — with actor, target and reason. Append-only.
          </p>
        </Panel>
      </div>
    </div>
  );
}
