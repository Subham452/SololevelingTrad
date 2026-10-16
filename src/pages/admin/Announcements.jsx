import { useEffect, useState } from "react";
import { announcementsApi } from "../../lib/announcements.js";
import { Panel, Button, Badge, Input, EmptyState } from "../../components/ui.jsx";
import { PageHeader, QueryState } from "../../components/admin/primitives.jsx";
const SEV = ["info", "success", "warning", "critical"];
export default function AdminAnnouncements() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ title: "", body: "", severity: "info", audience: "authenticated", status: "draft", publishAt: "", expiresAt: "", pinned: false });
  const load = () => { setLoading(true); announcementsApi.all({ limit: 50 }).then((d) => setItems(d?.items || [])).catch((e) => setErr(e.message)).finally(() => setLoading(false)); };
  useEffect(load, []);
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    try { await announcementsApi.create({ ...form, publishAt: form.publishAt || null, expiresAt: form.expiresAt || null }); setForm({ title: "", body: "", severity: "info", audience: "authenticated", status: "draft", publishAt: "", expiresAt: "", pinned: false }); load(); }
    catch (er) { setErr(er.message); }
  };
  return (
    <div>
      <PageHeader title="Announcements" desc="Publish, schedule, expire and withdraw platform notices. Only live items reach users." />
      <QueryState loading={loading && !items.length} error={err} onRetry={load} />
      <Panel title="New announcement">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Input aria-label="Title" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div className="flex gap-2">
            <select aria-label="Severity" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="rounded-lg bg-white/5 px-2 text-sm">{SEV.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select aria-label="Audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="rounded-lg bg-white/5 px-2 text-sm">{["all", "authenticated", "staff"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select aria-label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="rounded-lg bg-white/5 px-2 text-sm">{["draft", "scheduled", "published", "withdrawn", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <textarea aria-label="Message" placeholder="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm sm:col-span-2" rows={3} />
          <Input aria-label="Publish at" type="datetime-local" value={form.publishAt} onChange={(e) => setForm({ ...form, publishAt: e.target.value })} />
          <Input aria-label="Expires at" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin announcement</label>
          <div><Button size="sm" type="submit">Publish</Button></div>
        </form>
      </Panel>
      <div className="mt-4 space-y-2">
        {items.length === 0 && !loading && <Panel><EmptyState title="No announcements" copy="Create one above." /></Panel>}
        {items.map((a) => (
          <div key={a._id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{a.pinned ? "📌 " : ""}{a.title}</p>
              <p className="text-[11px] text-white/40">{a.status}{a.live ? " · live" : ""} · {a.audience} · {a.severity}</p>
            </div>
            <Badge tone={a.live ? "success" : "warning"}>{a.live ? "Live" : a.status}</Badge>
            {a.status !== "withdrawn" && <button onClick={() => announcementsApi.update(a._id, { status: "withdrawn" }).then(load)} className="text-xs text-amber-300 hover:underline">Withdraw</button>}
            {a.status !== "published" && <button onClick={() => announcementsApi.update(a._id, { status: "published" }).then(load)} className="text-xs text-cyan-300 hover:underline">Publish</button>}
            <button onClick={() => announcementsApi.remove(a._id).then(load)} aria-label="Archive" className="text-xs text-white/40 hover:text-white">Archive</button>
          </div>
        ))}
      </div>
    </div>
  );
}
