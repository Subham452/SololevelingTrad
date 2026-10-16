import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Plus, Users, CalendarClock, Bell, Pencil, Trash2, Radio, Square } from "lucide-react";
import { liveApi } from "../lib/comms.js";
import { useAuth } from "../context/useAuth.js";
import EditLiveModal from "../components/video/EditLiveModal.jsx";
import { Avatar } from "../components/community/Avatar.jsx";
import { Container, SectionHeading, Button, Input, Badge, EmptyState, Card } from "../components/ui.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import { cn } from "../lib/utils.js";

const CATEGORIES = ["Crypto Education", "Market Analysis", "Trading Discussion", "Community", "General"];

function LiveCard({ live, isMine, onOpen, onFollow, onEdit, onCancel, onEnd, onStudio }) {
  const liveNow = live.status === "live";
  return (
    <Card className="group flex flex-col gap-3 overflow-hidden p-0 transition hover:border-cyan-400/30">
      <div className="relative h-32 overflow-hidden bg-gradient-to-br from-violet-600/30 via-transparent to-cyan-600/30">
        {live.coverImage && <img src={live.coverImage} alt="" className="h-full w-full object-cover" />}
        <div className="absolute left-3 top-3 flex gap-2">
          {liveNow ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
            </span>
          ) : live.status === "scheduled" ? (
            <Badge tone="accent">Scheduled</Badge>
          ) : (
            <Badge tone="default">Ended</Badge>
          )}
        </div>
        {liveNow && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
            <Users className="h-3 w-3" /> {live.viewerCount || 0}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <Avatar name={live.hostName || "Host"} size="xs" id={live.hostId} />
          <span className="truncate text-xs text-white/60">{live.hostName || "Host"}</span>
          {isMine && <Badge tone="accent">Yours</Badge>}
        </div>
        <h3 className="line-clamp-2 font-semibold text-white">{live.title}</h3>
        <p className="line-clamp-2 text-xs text-white/40">{live.description || live.category}</p>
        {live.status === "scheduled" && live.scheduledStartAt && (
          <p className="inline-flex items-center gap-1 text-xs text-amber-300"><CalendarClock className="h-3 w-3" /> {new Date(live.scheduledStartAt).toLocaleString()}</p>
        )}
        {live.status === "live" && live.peakViewers > 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-white/40"><Users className="h-3 w-3" /> Peak {live.peakViewers}</p>
        )}
        <div className="mt-auto flex gap-2 pt-2">
          {isMine && live.status === "scheduled" ? (
            <Button size="sm" className="flex-1" onClick={() => onStudio(live)}><Radio className="h-3.5 w-3.5" /> Open studio</Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={() => onOpen(live)}>
              {liveNow ? "Watch live" : live.status === "scheduled" ? "View" : "View replay"}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => onFollow(live)} aria-label="Remind me">
            <Bell className="h-3.5 w-3.5" />
          </Button>
        </div>
        {isMine && live.status !== "ended" && (
          <div className="flex gap-2 border-t border-white/10 pt-2">
            {live.status === "scheduled" && (
              <>
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => onEdit(live)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                <Button size="sm" variant="ghost" className="flex-1 text-red-400 hover:text-red-300" onClick={() => onCancel(live)}><Trash2 className="h-3.5 w-3.5" /> Cancel</Button>
              </>
            )}
            {liveNow && (
              <>
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => onStudio(live)}><Radio className="h-3.5 w-3.5" /> Studio</Button>
                <Button size="sm" variant="ghost" className="flex-1 text-red-400 hover:text-red-300" onClick={() => onEnd(live)}><Square className="h-3.5 w-3.5" /> End</Button>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Live() {
  const nav = useNavigate();
  const { user } = useAuth();
  const uid = String(user?._id || user?.id || "");
  const [tab, setTab] = useState("live");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'cancel'|'end', live }

  const load = async () => {
    setLoading(true); setErr(null);
    try { const { items } = await liveApi.list(tab, { q, category }); setItems(items || []); }
    catch (e) { setErr(e?.message || "Failed to load sessions"); }
    finally { setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [tab, q, category]);

  const follow = async (live) => {
    try { await liveApi.follow(live._id); } catch { /* best-effort */ }
  };

  const doConfirm = async () => {
    if (!confirm) return;
    const { kind, live } = confirm;
    setConfirm(null);
    try {
      if (kind === "cancel") await liveApi.cancel(live._id);
      else await liveApi.end(live._id);
      setItems((list) => kind === "cancel"
        ? list.filter((l) => String(l._id) !== String(live._id))
        : list.map((l) => (String(l._id) === String(live._id) ? { ...l, status: "ended" } : l)));
    } catch (e) { setErr(e?.message || "Action failed"); }
  };

  return (
    <Container className="py-8">
      <SectionHeading
        eyebrow="Live"
        title="Live sessions"
        desc="Broadcast market analysis and education to your community, or tune in live."
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sessions…" className="pl-9" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button onClick={() => nav("/live/create")}><Plus className="h-4 w-4" /> Go live</Button>
      </div>

      <div className="mt-4 flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
        {[["live", "Live now"], ["upcoming", "Upcoming"], ["mine", "Hosted by me"], ["following", "Following"], ["ended", "Recently ended"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-full px-3 py-1.5 text-xs transition", tab === k ? "bg-white text-black" : "text-white/60 hover:text-white")}>{label}</button>
        ))}
      </div>

      <div className="mt-6">
        {loading ? (
          <SkeletonLoader rows={3} />
        ) : err ? (
          <EmptyState title="Couldn't load sessions" desc={err} action={<Button onClick={load} size="sm">Retry</Button>} />
        ) : items.length === 0 ? (
          <EmptyState
            title={tab === "live" ? "Nothing live right now" : "No sessions here"}
            desc={tab === "live" ? "When hosts go live, they'll appear here." : "Check back soon or schedule your own."}
            action={<Button onClick={() => nav("/live/create")} size="sm"><Plus className="h-4 w-4" /> Create session</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((live, i) => (
              <motion.div key={live._id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <LiveCard
                  live={live}
                  isMine={uid !== "" && String(live.hostId) === uid}
                  onOpen={(l) => nav(`/live/${l._id}`)}
                  onFollow={follow}
                  onEdit={(l) => setEditing(l)}
                  onCancel={(l) => setConfirm({ kind: "cancel", live: l })}
                  onEnd={(l) => setConfirm({ kind: "end", live: l })}
                  onStudio={(l) => nav(`/live/${l._id}/studio`)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditLiveModal
          live={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setItems((list) => list.map((l) => (String(l._id) === String(editing._id) ? { ...l, ...(typeof updated === "object" ? updated : {}) } : l)));
            setEditing(null);
          }}
        />
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 text-center">
            <h3 className="text-lg font-semibold text-white">
              {confirm.kind === "cancel" ? "Cancel this session?" : "End the broadcast?"}
            </h3>
            <p className="mt-2 text-sm text-white/50">
              {confirm.kind === "cancel"
                ? "Scheduled viewers won't be notified. This can't be undone."
                : "Everyone watching will be disconnected."}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>Keep it</Button>
              <Button onClick={doConfirm}>{confirm.kind === "cancel" ? "Yes, cancel" : "End now"}</Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
