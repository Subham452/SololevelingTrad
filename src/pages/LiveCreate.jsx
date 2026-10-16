import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Radio } from "lucide-react";
import { liveApi } from "../lib/comms.js";
import { Container, SectionHeading, Button, Input, Card } from "../components/ui.jsx";

const CATEGORIES = ["Crypto Education", "Market Analysis", "Trading Discussion", "Community", "General"];

export default function LiveCreate() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    title: "", description: "", category: "Market Analysis", access: "public",
    broadcastMode: "hls", chatEnabled: true, questionsEnabled: true, reactionsEnabled: true, capacity: 500,
  });
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const body = {
        ...form, capacity: Number(form.capacity),
        ...(schedule && when ? { scheduledStartAt: new Date(when).toISOString() } : {}),
      };
      const { live } = await liveApi.create(body);
      // Route to the studio where the host explicitly starts the broadcast.
      nav(`/live/${live._id}/studio`);
    } catch (e) { setErr(e?.message || "Failed to create session"); }
    finally { setBusy(false); }
  };

  return (
    <Container className="py-8 max-w-2xl">
      <button onClick={() => nav("/live")} className="mb-3 inline-flex items-center gap-1 text-sm text-white/50 hover:text-white"><ArrowLeft className="h-4 w-4" /> Live</button>
      <SectionHeading eyebrow="Go live" title="Create a live session" desc="Set up your broadcast. It only appears as Live once you start it from the studio." />

      <Card className="mt-6 space-y-4">
        <label className="block text-sm text-white/70">Title
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. BTC Technical Breakdown" className="mt-1" />
        </label>
        <label className="block text-sm text-white/70">Description
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30" placeholder="What will you cover?" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="space-y-2">
          {[["chatEnabled", "Enable live chat"], ["questionsEnabled", "Allow questions"], ["reactionsEnabled", "Allow reactions"]].map(([k, label]) => (
            <label key={k} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
              {label}
              <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 accent-cyan-400" />
            </label>
          ))}
        </div>
        <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
          Schedule for later
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="h-4 w-4 accent-cyan-400" />
        </label>
        {schedule && (
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
        )}
        {err && <p className="text-xs text-red-400">{err}</p>}
      </Card>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={() => nav("/live")}>Cancel</Button>
        {!schedule && <Button variant="secondary" onClick={() => submit()} loading={busy}>Save as draft</Button>}
        <Button onClick={() => submit()} loading={busy}><Radio className="h-4 w-4" /> {schedule ? "Schedule" : "Continue to studio"}</Button>
      </div>
    </Container>
  );
}
