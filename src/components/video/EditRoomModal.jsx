import { useState } from "react";
import { X } from "lucide-react";
import { roomApi } from "../../lib/comms.js";
import { Button, Input } from "../ui.jsx";

// Owner-only edit dialog for a meeting room.
export default function EditRoomModal({ room, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: room?.name || "",
    description: room?.description || "",
    access: room?.access || "invite",
    capacity: room?.capacity || 20,
    waitingRoom: !!room?.waitingRoom,
    requireApproval: !!room?.requireApproval,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const { room: updated } = await roomApi.update(room._id, {
        name: form.name.trim(), description: form.description, access: form.access,
        capacity: Number(form.capacity), waitingRoom: form.waitingRoom,
        requireApproval: form.requireApproval,
      });
      onSaved(updated || form);
    } catch (e) { setErr(e?.message || "Failed to save changes"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-neutral-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Edit room</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-white/50 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm text-white/70">Room name
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" />
          </label>
          <label className="block text-sm text-white/70">Description
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-white/70">Access
              <select value={form.access} onChange={(e) => set("access", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                <option value="private">Private</option>
                <option value="invite">Invite only</option>
                <option value="discoverable">Discoverable</option>
              </select>
            </label>
            <label className="block text-sm text-white/70">Capacity
              <Input type="number" min={2} max={200} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className="mt-1" />
            </label>
          </div>
          <div className="space-y-2">
            {[["waitingRoom", "Enable waiting room"], ["requireApproval", "Require host approval"]].map(([k, label]) => (
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
          <Button onClick={save} loading={busy} disabled={form.name.trim().length < 2}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}
