import { useCallback, useEffect, useState } from "react";
import { Cpu, Database, HardDrive, HeartPulse, Server, Timer } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { Badge, Panel } from "../../components/ui.jsx";
import { PageHeader, QueryState, RefreshButton, StatCard } from "../../components/admin/primitives.jsx";
import { fmtDate, fmtNum } from "../../components/admin/format.js";

const STATE_TONE = { healthy: "success", degraded: "warning", down: "danger" };

export default function AdminHealth() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setLoading(true); setErr("");
    adminApi.health()
      .then(setData)
      .catch((e) => setErr(e?.message || "Health check failed — is the backend running?"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const uptime = data?.uptimeSec ?? 0;
  const hh = Math.floor(uptime / 3600);
  const mm = Math.floor((uptime % 3600) / 60);
  const ss = uptime % 60;

  return (
    <div>
      <PageHeader
        title="System health"
        desc="Live process, database and record counts reported by the backend."
        actions={<RefreshButton onClick={load} loading={loading} label="Re-check" />}
      />

      <QueryState loading={loading && !data} error={err} onRetry={load} rows={3} />

      {data && (
        <>
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${data.status === "healthy" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
              <HeartPulse className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                {data.status === "healthy" ? "All systems operational" : "Degraded"}
                <Badge tone={STATE_TONE[data.status] || "default"}>{data.status}</Badge>
              </p>
              <p className="mt-0.5 text-xs text-white/45">Checked {fmtDate(data.checkedAt)} · Node {data.node}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Uptime" icon={Timer} tone="cyan" value={`${hh}h ${mm}m ${ss}s`} sub="process uptime" loading={loading} />
            <StatCard label="Database" icon={Database} tone={data.db?.state === "connected" ? "green" : "rose"} value={data.db?.state || "unknown"} sub={data.db?.name || ""} loading={loading} />
            <StatCard label="Memory (RSS)" icon={HardDrive} tone="violet" value={`${fmtNum(data.memory?.rssMb)} MB`} sub={`heap ${fmtNum(data.memory?.heapUsedMb)} MB`} loading={loading} />
            <StatCard label="Users" icon={Server} tone="white" value={fmtNum(data.counts?.users)} sub="records" loading={loading} />
            <StatCard label="Payments" icon={Cpu} tone="amber" value={fmtNum(data.counts?.payments)} sub="records" loading={loading} />
            <StatCard label="Calls" icon={Server} tone="white" value={fmtNum(data.counts?.calls)} sub={`${fmtNum(data.counts?.liveSessions)} lives`} loading={loading} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Record counts" desc="Estimated document counts per collection">
              <dl className="divide-y divide-white/[0.06]">
                {Object.entries(data.counts || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-2.5 text-sm">
                    <dt className="capitalize text-white/60">{k.replace(/([A-Z])/g, " $1")}</dt>
                    <dd className="num text-white">{fmtNum(v)}</dd>
                  </div>
                ))}
                {Object.keys(data.counts || {}).length === 0 && (
                  <p className="py-4 text-center text-xs text-white/40">Database unreachable — counts unavailable.</p>
                )}
              </dl>
            </Panel>

            <Panel title="Configuration checklist" desc="Values the backend expects (names only — secrets are never exposed)">
              <ul className="space-y-2 text-xs text-white/55">
                <li className="flex items-start gap-2"><Badge tone="accent">required</Badge> <span><span className="num text-white/80">MONGODB_URI</span> — database connection string.</span></li>
                <li className="flex items-start gap-2"><Badge tone="accent">required</Badge> <span><span className="num text-white/80">JWT_ACCESS_SECRET</span> / <span className="num text-white/80">JWT_REFRESH_SECRET</span> — session signing keys.</span></li>
                <li className="flex items-start gap-2"><Badge tone="warning">payments</Badge> <span><span className="num text-white/80">PAYMENT_PROVIDER</span> = razorpay|stripe plus the matching key pair for live refunds.</span></li>
                <li className="flex items-start gap-2"><Badge tone="violet">optional</Badge> <span><span className="num text-white/80">FIREBASE_*</span> — consumer sign-in; staff can use local password login without it.</span></li>
                <li className="flex items-start gap-2"><Badge tone="violet">optional</Badge> <span><span className="num text-white/80">VIDEOSDK_*</span> — calls and live sessions.</span></li>
              </ul>
              <p className="mt-3 text-[11px] text-white/35">Copy <span className="num">.env.example</span> to <span className="num">.env</span> in the backend folder and fill in values. Never commit real secrets.</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
