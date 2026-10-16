import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, Repeat, TrendingDown } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { Badge, Panel } from "../../components/ui.jsx";
import { DataTable, DateRangePresets, PageHeader, Pagination, QueryState, RefreshButton, SelectFilter, StatCard, StatusPill } from "../../components/admin/primitives.jsx";
import { defaultRange, fmtDate, fmtINR, fmtMoney, fmtNum } from "../../components/admin/format.js";

const CHART_AXIS = { stroke: "#3f4a63", fontSize: 11 };
const tooltipStyle = {
  contentStyle: { background: "#0b0f1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "rgba(255,255,255,0.6)" },
  itemStyle: { color: "#e5eaf5" },
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "past_due", label: "Past due" },
];
const PLAN_OPTIONS = [
  // Current pricing tiers (values match the Plan catalogue slugs).
  { value: "starter", label: "Starter ($20)" },
  { value: "basic", label: "Basic ($30)" },
  { value: "pro", label: "Pro ($50)" },
  { value: "elite", label: "Elite ($100)" },
  { value: "ultimate", label: "Ultimate ($150)" },
  // Legacy tiers retained for subscriptions created before the migration.
  { value: "HUNTER", label: "Hunter (legacy)" },
  { value: "AWAKENED", label: "Awakened (legacy)" },
  { value: "MONARCH", label: "Monarch (legacy)" },
];

export default function AdminSubscriptions() {
  const [range, setRange] = useState(() => defaultRange());
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsErr, setStatsErr] = useState("");

  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [list, setList] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listErr, setListErr] = useState("");

  const loadStats = useCallback(() => {
    setStatsLoading(true); setStatsErr("");
    adminApi.subscriptionStats({ from: range.from, to: range.to })
      .then(setStats)
      .catch((e) => setStatsErr(e?.message || "Failed to load subscription analytics"))
      .finally(() => setStatsLoading(false));
  }, [range.from, range.to]);

  const loadList = useCallback(() => {
    setListLoading(true); setListErr("");
    adminApi.subscriptions({ status, plan, from: range.from, to: range.to, sort, dir, page, limit })
      .then(setList)
      .catch((e) => setListErr(e?.message || "Failed to load subscriptions"))
      .finally(() => setListLoading(false));
  }, [status, plan, range.from, range.to, sort, dir, page, limit]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { setPage(1); }, [status, plan, range]);

  const onSort = (key) => {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setDir("desc"); }
  };

  const rows = list?.items || [];
  const counts = stats?.counts || {};
  const planMix = (stats?.byPlan || [])
    .filter((p) => p.status === "active")
    .map((p) => ({ plan: p.plan, count: p.count }));
  const revenueByPlan = (stats?.revenueByPlan || [])
    .filter((r) => (r.currency || "USD") === (stats?.mrrCurrency || "USD"));
  const otherRevenue = (stats?.revenueByCurrency || {});
  const primaryCur = stats?.mrrCurrency || "USD";
  const otherRevenueEntries = Object.entries(otherRevenue).filter(([c]) => c !== primaryCur);
  const revFmt = (v) => (primaryCur === "USD" ? fmtMoney(v, "USD") : primaryCur === "INR" ? fmtINR(v) : fmtMoney(v, primaryCur));

  return (
    <div>
      <PageHeader
        title="Subscriptions & revenue"
        desc="Plan mix, MRR and churn computed from subscription records and configured plan prices."
        actions={<RefreshButton onClick={() => { loadStats(); loadList(); }} loading={statsLoading || listLoading} />}
      />

      <DateRangePresets value={range} onChange={setRange} className="mb-5" />

      <QueryState loading={statsLoading && !stats} error={statsErr} onRetry={loadStats} rows={3} />

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Active" icon={Activity} tone="green" loading={statsLoading} value={fmtNum(stats.active)} sub="subscriptions" />
            <StatCard label="MRR" icon={Repeat} tone="cyan" loading={statsLoading} value={fmtMoney(stats.mrr, stats.mrrCurrency || "USD")} sub={`${stats.mrrCurrency || "USD"} from active plans`} tip={`Sum of configured plan prices across active subscriptions, in the plan's own currency. Multi-currency totals: ${JSON.stringify(stats.mrrByCurrency || {})}`} />
            <StatCard label="New in range" icon={Activity} tone="violet" loading={statsLoading} value={fmtNum(stats.newInRange)} sub="subscriptions" />
            <StatCard label="Churned" icon={TrendingDown} tone="rose" loading={statsLoading} value={fmtNum(stats.churnedInRange)} sub="cancelled/expired" />
            <StatCard label="Churn rate" icon={TrendingDown} tone="amber" loading={statsLoading} value={`${stats.churnRate}%`} sub="in range" />
            <StatCard label="Past due" icon={Activity} tone="white" loading={statsLoading} value={fmtNum(counts.past_due || 0)} sub={`${fmtNum(counts.cancelled || 0)} cancelled · ${fmtNum(counts.expired || 0)} expired`} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Active subscriptions by plan" desc="Current plan distribution">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={planMix} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="plan" tick={CHART_AXIS} tickLine={false} axisLine={false} />
                    <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [fmtNum(v), "Subscribers"]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="count" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {planMix.length === 0 && <p className="mt-2 text-center text-xs text-white/40">No active subscriptions in range.</p>}
            </Panel>

            <Panel title="Paid revenue by plan" desc="Confirmed payments grouped by plan in range">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByPlan} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="plan" tick={CHART_AXIS} tickLine={false} axisLine={false} />
                    <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => revFmt(v)} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [revFmt(v), `Revenue (${primaryCur})`]} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {revenueByPlan.length === 0 && <p className="mt-2 text-center text-xs text-white/40">No paid revenue in {primaryCur} in range.</p>}
              {otherRevenueEntries.length > 0 && (
                <p className="mt-2 text-center text-[11px] text-white/40">
                  Also collected: {otherRevenueEntries.map(([c, v]) => `${fmtMoney(v, c)}`).join(" · ")} — shown separately, never summed across currencies.
                </p>
              )}
            </Panel>
          </div>

          <Panel className="mt-4" title="Plan catalogue" desc="Live from the database — edit, publish and archive on the Pricing &amp; Plans page">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(stats.plans || []).map((p) => (
                <div key={p.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{p.name}</p>
                    <Badge tone={p.legacy ? "default" : "accent"}>{p.id}</Badge>
                  </div>
                  <p className="num mt-2 text-xl font-semibold text-white">
                    {p.priceCents === 0
                      ? "Free"
                      : fmtMoney(p.priceCents / 100, p.currency, { decimals: p.priceCents % 100 === 0 ? 0 : 2 })}
                    <span className="text-xs font-normal text-white/40"> /{p.interval || "month"}</span>
                  </p>
                  {(p.features || []).length > 0 && (
                    <ul className="mt-2 space-y-1 text-[11px] text-white/50">
                      {p.features.slice(0, 5).map((f) => <li key={f}>· {f}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}

      {/* List */}
      <div className="mt-5 mb-3 flex flex-wrap items-center gap-2">
        <SelectFilter label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <SelectFilter label="Plan" value={plan} onChange={setPlan} options={PLAN_OPTIONS} />
        {(status || plan) && (
          <button
            type="button" onClick={() => { setStatus(""); setPlan(""); }}
            className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-500/20"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <QueryState
          loading={listLoading && !list} error={listErr} onRetry={loadList} rows={5}
          empty={!listLoading && !listErr && rows.length === 0}
          emptyTitle="No subscriptions match these filters"
        />
        {rows.length > 0 && (
          <>
            <DataTable
              columns={[
                {
                  key: "userId", header: "User",
                  render: (s) => (s.userId
                    ? <Link to={`/admin/users/${s.userId._id}`} className="block min-w-0 truncate text-sm text-white/80 hover:text-cyan-300">{s.userId.email}</Link>
                    : <span className="text-xs text-white/40">—</span>),
                },
                { key: "plan", header: "Plan", sortable: true, render: (s) => <Badge tone="accent">{s.plan}</Badge> },
                { key: "status", header: "Status", sortable: true, render: (s) => <StatusPill status={s.status} /> },
                { key: "startedAt", header: "Started", render: (s) => <span className="text-xs text-white/45">{fmtDate(s.startedAt, { time: false })}</span> },
                { key: "expiresAt", header: "Expires", sortable: true, render: (s) => <span className="text-xs text-white/45">{fmtDate(s.expiresAt, { time: false })}</span> },
                { key: "createdAt", header: "Created", sortable: true, render: (s) => <span className="text-xs text-white/45">{fmtDate(s.createdAt)}</span> },
              ]}
              rows={rows} sort={sort} dir={dir} onSort={onSort}
            />
            <Pagination page={list?.page} pages={list?.pages} total={list?.total} onPage={setPage} limit={limit} onLimit={setLimit} loading={listLoading} />
          </>
        )}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35">
        <ArrowUpRight className="h-3 w-3" aria-hidden />
        Plan catalogue is exposed read-only; price changes live in the backend billing config so payments always verify against server-side prices.
      </p>
    </div>
  );
}
