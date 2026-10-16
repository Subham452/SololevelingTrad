import { useCallback, useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Globe, KeyRound, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { Badge, Panel } from "../../components/ui.jsx";
import { DataTable, DateRangePresets, PageHeader, QueryState, RefreshButton, StatCard } from "../../components/admin/primitives.jsx";
import { defaultRange, fmtDate, fmtNum } from "../../components/admin/format.js";

const CHART_AXIS = { stroke: "#3f4a63", fontSize: 11 };
const tooltipStyle = {
  contentStyle: { background: "#0b0f1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "rgba(255,255,255,0.6)" },
  itemStyle: { color: "#e5eaf5" },
};

export default function AdminSecurity() {
  const [range, setRange] = useState(() => defaultRange());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setLoading(true); setErr("");
    adminApi.security({ from: range.from, to: range.to })
      .then(setData)
      .catch((e) => setErr(e?.message || "Failed to load security data"))
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const failedTrend = data?.failedByDay || [];
  const failedIps = data?.failedByIp || [];
  const logins = data?.logins || [];
  const sessions = data?.activeSessions || [];
  const audits = data?.recentAudit || [];

  return (
    <div>
      <PageHeader
        title="Security"
        desc="Login history, failed sign-in attempts, active sessions and the admin audit feed."
        actions={<RefreshButton onClick={load} loading={loading} />}
      />

      <DateRangePresets value={range} onChange={setRange} className="mb-5" />

      <QueryState loading={loading && !data} error={err} onRetry={load} rows={4} />

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Failed logins" icon={ShieldAlert} tone="rose" loading={loading} value={fmtNum(data.totals?.failed)} sub="in range" />
            <StatCard label="Active sessions" icon={KeyRound} tone="cyan" loading={loading} value={fmtNum(data.totals?.activeSessions)} sub="unexpired" />
            <StatCard label="Login attempts" icon={Lock} tone="white" loading={loading} value={fmtNum(logins.length)} sub="records shown" />
            <StatCard label="Audit entries" icon={ShieldCheck} tone="violet" loading={loading} value={fmtNum(audits.length)} sub="recent" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel title="Failed sign-ins" desc="Daily failed login attempts" className="xl:col-span-2">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={failedTrend} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#fb7185" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" tick={CHART_AXIS} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={CHART_AXIS} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [fmtNum(v), "Failed attempts"]} />
                    <Area type="monotone" dataKey="value" stroke="#fb7185" strokeWidth={2} fill="url(#failGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {failedTrend.length === 0 && <p className="mt-1 text-center text-xs text-white/40">No failed attempts in this range — good sign.</p>}
            </Panel>

            <Panel title="Top failed-attempt IPs" desc="Highest-volume sources">
              {failedIps.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/40">No failed attempts recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {failedIps.map((r) => (
                    <li key={r._id || "unknown"} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2 text-xs text-white/70">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-white/35" aria-hidden />
                        <span className="num truncate">{r._id || "unknown"}</span>
                      </span>
                      <Badge tone="danger">{fmtNum(r.count)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Panel title="Recent login attempts" desc="Success and failure, with IP">
              <DataTable
                columns={[
                  { key: "success", header: "Result", render: (l) => (l.success ? <Badge tone="success">success</Badge> : <Badge tone="danger">failed</Badge>) },
                  { key: "userId", header: "User", render: (l) => <span className="block max-w-[14rem] truncate text-xs text-white/70">{l.userId?.email || "unknown"}</span> },
                  { key: "ip", header: "IP", render: (l) => <span className="num text-xs text-white/45">{l.ip || "—"}</span> },
                  { key: "createdAt", header: "When", render: (l) => <span className="text-xs text-white/45">{fmtDate(l.createdAt)}</span> },
                ]}
                rows={logins} rowKey="_id"
              />
            </Panel>

            <Panel title="Active sessions" desc="Unexpired refresh-token sessions">
              <DataTable
                columns={[
                  { key: "userId", header: "User", render: (s) => <span className="block max-w-[14rem] truncate text-xs text-white/70">{s.userId?.email || "unknown"}</span> },
                  { key: "device", header: "Device", render: (s) => <span className="text-xs text-white/60">{s.device || "—"}</span> },
                  { key: "ipAddress", header: "IP", render: (s) => <span className="num text-xs text-white/45">{s.ipAddress || "—"}</span> },
                  { key: "expiresAt", header: "Expires", render: (s) => <span className="text-xs text-white/45">{fmtDate(s.expiresAt)}</span> },
                ]}
                rows={sessions} rowKey="_id"
              />
              {sessions.length === 0 && <p className="py-4 text-center text-xs text-white/40">No active sessions.</p>}
            </Panel>
          </div>

          <Panel className="mt-4" title="Latest admin audit entries" desc="Who did what, most recent first">
            <DataTable
              columns={[
                { key: "action", header: "Action", render: (a) => <Badge tone="accent">{a.action}</Badge> },
                { key: "actorId", header: "Actor", render: (a) => <span className="text-xs text-white/70">{a.actorId?.email || "system"}</span> },
                { key: "target", header: "Target", render: (a) => <span className="num text-xs text-white/45">{a.target ? String(a.target).slice(0, 12) : "—"}</span> },
                { key: "meta", header: "Meta", render: (a) => <span className="block max-w-[18rem] truncate text-xs text-white/45">{a.meta ? JSON.stringify(a.meta) : "—"}</span> },
                { key: "createdAt", header: "When", render: (a) => <span className="text-xs text-white/45">{fmtDate(a.createdAt)}</span> },
              ]}
              rows={audits} rowKey="_id"
            />
            {audits.length === 0 && <p className="py-4 text-center text-xs text-white/40">No audit entries yet.</p>}
          </Panel>
        </>
      )}
    </div>
  );
}
