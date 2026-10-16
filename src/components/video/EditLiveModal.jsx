import { useState } from "react";
import { X } from "lucide-react";
import { liveApi } from "../../lib/comms.js";
import { Button, Input } from "../ui.jsx";

const CATEGORIES = ["Crypto Education", "Market Analysis", "Trading Discussion", "Community", "General"];

// Host-only edit dialog for a scheduled (or live, for safe fields) session.
// Ended/cancelled sessions are rejected server-side.
export default function EditLiveModal({ live, onClose, onSaved }) {
  const toLocal = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [form, setForm] = useState({
    title: live?.title || "",
    description: live?.description || "",
    category: live?.category || "General",
    access: live?.access || "public",
    capacity: live?.capacity || 500,
    chatEnabled: live?.chatEnabled !== false,
    questionsEnabled: live?.questionsEnabled !== false,
    reactionsEnabled: live?.reactionsEnabled !== false,
  });
  const [when, setWhen] = useState(toLocal(live?.scheduledStartAt));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = {
        title: form.title.trim(), description: form.description, category: form.category,
        access: form.access, capacity: Number(form.capacity),
        chatEnabled: form.chatEnabled, questionsEnabled: form.questionsEnabled,
        reactionsEnabled: form.reactionsEnabled,
        ...(when ? { scheduledStartAt: new Date(when).toISOString() } : {}),
      };
      const { live: updated } = await liveApi.update(live._id, body);
      onSaved(updated || body);
    } catch (e) { setErr(e?.message || "Failed to save changes"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-neutral-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Edit session</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-white/50 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm text-white/70">Title
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} className="mt-1" />
          </label>
          <label className="block text-sm text-white/70">Description
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-white/70">Category
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block text-sm text-white/70">Access
              <select value={form.access} onChange={(e) => set("access", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
                <option value="premium">Premium</option>
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-white/70">Capacity
              <Input type="number" min={2} max={2000} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className="mt-1" />
            </label>
            <label className="block text-sm text-white/70">Scheduled start
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
            </label>
          </div>
          <div className="space-y-2">
            {[["chatEnabled", "Enable live chat"], ["questionsEnabled", "Allow questions"], ["reactionsEnabled", "Allow reactions"]].map(([k, label]) => (
              <label key={k} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                {label}
                <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 accent-cyan-400" />
              </label>
            ))}
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy} disabled={form.title.trim().length < 3}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}
