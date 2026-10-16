import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Users as UsersIcon } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { Badge, Button } from "../../components/ui.jsx";
import { DataTable, DateRangePresets, PageHeader, Pagination, QueryState, RefreshButton, SearchInput, SelectFilter, StatusPill } from "../../components/admin/primitives.jsx";
import { fmtDate } from "../../components/admin/format.js";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
  { value: "banned", label: "Banned" },
  { value: "inactive", label: "Inactive" },
];
const ROLE_OPTIONS = [
  { value: "user", label: "User" },
  { value: "support", label: "Support" },
  { value: "analyst", label: "Analyst" },
  { value: "finance", label: "Finance" },
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Superadmin" },
];
const PLAN_OPTIONS = [
  { value: "FREE", label: "Free" },
  // Current pricing tiers (values match the Plan catalogue slugs).
  { value: "starter", label: "Starter ($20)" },
  { value: "basic", label: "Basic ($30)" },
  { value: "pro", label: "Pro ($50)" },
  { value: "elite", label: "Elite ($100)" },
  { value: "ultimate", label: "Ultimate ($150)" },
  // Legacy tiers retained for accounts created before the pricing migration.
  { value: "HUNTER", label: "Hunter (legacy)" },
  { value: "AWAKENED", label: "Awakened (legacy)" },
  { value: "MONARCH", label: "Monarch (legacy)" },
];
const VERIFY_OPTIONS = [
  { value: "true", label: "Verified" },
  { value: "false", label: "Unverified" },
];

const roleTone = (role) => (role === "superadmin" ? "violet" : role === "admin" ? "accent" : role === "support" ? "warning" : "default");

export default function AdminUsers() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [plan, setPlan] = useState("");
  const [verified, setVerified] = useState("");
  const [range, setRange] = useState(null);
  const [sort, setSort] = useState("createdAt");
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setLoading(true); setErr("");
    adminApi.users({
      q, status, role, plan, verified,
      from: range?.from, to: range?.to,
      sort, dir, page, limit,
    })
      .then(setData)
      .catch((e) => setErr(e?.message || "Failed to load users"))
      .finally(() => setLoading(false));
  }, [q, status, role, plan, verified, range, sort, dir, page, limit]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 whenever filters change.
  useEffect(() => { setPage(1); }, [q, status, role, plan, verified, range]);

  const onSort = (key) => {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setDir("desc"); }
  };

  const clearFilters = () => {
    setQ(""); setStatus(""); setRole(""); setPlan(""); setVerified(""); setRange(null);
  };

  const hasFilters = Boolean(q || status || role || plan || verified || range);
  const rows = data?.items || [];

  const exportCsv = () => {
    // Client-side CSV of the currently filtered page(s) — export from the
    // visible result set rather than silently re-querying the backend.
    const cols = ["email", "name", "status", "role", "plan", "verified", "created"];
    const body = rows.map((u) => [
      u.email,
      [u.firstName, u.lastName].filter(Boolean).join(" "),
      u.status, u.role, u.plan, u.emailVerified ? "yes" : "no",
      new Date(u.createdAt).toISOString(),
    ]);
    const csv = [cols, ...body]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-page${data?.page || 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      key: "email", header: "User", sortable: true,
      render: (u) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() || u.email : u.email}</p>
          <p className="truncate text-xs text-white/40">{u.email}{u.username ? ` · @${u.username}` : ""}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", sortable: true, render: (u) => <StatusPill status={u.status} /> },
    {
      key: "role", header: "Role", sortable: true,
      render: (u) => <Badge tone={roleTone(u.role)}>{u.role}</Badge>,
    },
    { key: "plan", header: "Plan", sortable: true, render: (u) => <span className="num text-xs text-white/70">{u.plan || "FREE"}</span> },
    {
      key: "emailVerified", header: "Verified",
      render: (u) => (u.emailVerified
        ? <Badge tone="success">yes</Badge>
        : <Badge tone="warning">no</Badge>),
    },
    { key: "lastActiveAt", header: "Last active", sortable: true, render: (u) => <span className="text-xs text-white/45">{fmtDate(u.lastActiveAt)}</span> },
    { key: "createdAt", header: "Joined", sortable: true, render: (u) => <span className="text-xs text-white/45">{fmtDate(u.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        desc="Server-side search, filters and pagination over the full user base."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <RefreshButton onClick={load} loading={loading} />
          </>
        }
      />

      {/* Filter toolbar */}
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={q} onChange={setQ}
            placeholder="Search by email, name, username or id…"
            className="w-full sm:w-80"
            ariaLabel="Search users"
          />
          <SelectFilter label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <SelectFilter label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
          <SelectFilter label="Plan" value={plan} onChange={setPlan} options={PLAN_OPTIONS} />
          <SelectFilter label="Email" value={verified} onChange={setVerified} options={VERIFY_OPTIONS} />
          {hasFilters && (
            <button
              type="button" onClick={clearFilters}
              className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-500/20"
            >
              Clear filters
            </button>
          )}
        </div>
        <DateRangePresets value={range} onChange={setRange} className="mt-3" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <QueryState
          loading={loading && !data} error={err} onRetry={load} rows={6}
          empty={!loading && !err && rows.length === 0}
          emptyTitle="No users match these filters"
          emptyDesc="Try a broader search or clear the active filters."
        />
        {rows.length > 0 && (
          <>
            <DataTable
              columns={columns} rows={rows} sort={sort} dir={dir} onSort={onSort}
              onRowClick={(u) => navigate(`/admin/users/${u._id}`)}
            />
            <Pagination
              page={data?.page} pages={data?.pages} total={data?.total}
              onPage={setPage} limit={limit} onLimit={setLimit} loading={loading}
            />
          </>
        )}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35">
        <UsersIcon className="h-3 w-3" aria-hidden />
        Row actions live on the user detail page — every change requires confirmation and is written to the audit log.
      </p>
    </div>
  );
}
