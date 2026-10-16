import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Video, AudioLines, Users, CalendarClock, KeyRound, X, Copy, Check, Pencil, Trash2, Square,
} from "lucide-react";
import { roomApi } from "../lib/comms.js";
import { useAuth } from "../context/useAuth.js";
import EditRoomModal from "../components/video/EditRoomModal.jsx";
import { Container, SectionHeading, Button, Input, Badge, EmptyState, Card } from "../components/ui.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import { cn } from "../lib/utils.js";

const typeIcon = { audio: AudioLines, video: Video, meeting: Users };
const accessBadge = { private: "Private", invite: "Invite only", discoverable: "Discoverable" };
const statusTone = { active: "success", scheduled: "accent", waiting: "default", ended: "default", cancelled: "danger" };

function RoomCard({ room, isOwner, onJoin, onEdit, onCancel, onEnd }) {
  const Icon = typeIcon[room.roomType] || Users;
  const scheduled = room.status === "scheduled" && room.scheduledStartAt;
  return (
    <Card className="group flex flex-col gap-3 p-4 transition hover:border-cyan-400/30">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 text-cyan-300">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-white">{room.name}</h3>
            <p className="truncate text-xs text-white/40">{room.description || "No description"}</p>
          </div>
        </div>
        <Badge tone={statusTone[room.status] || "default"}>
          {room.status === "active" ? "Live now" : room.status}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
        <Badge tone="default">{accessBadge[room.access] || room.access}</Badge>
        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {room.memberCount || 0}</span>
        {scheduled && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {new Date(room.scheduledStartAt).toLocaleString()}
          </span>
        )}
        {room.waitingRoom && <Badge tone="warning">Waiting room</Badge>}
      </div>
      <div className="mt-auto flex gap-2">
        <Button size="sm" onClick={() => onJoin(room)} className="flex-1">
          {room.status === "active" ? "Join now" : scheduled ? "View room" : "Open"}
        </Button>
      </div>
      {isOwner && (room.status === "scheduled" || room.status === "waiting" || room.status === "active") && (
        <div className="flex gap-2 border-t border-white/10 pt-2">
          <Button size="sm" variant="ghost" className="flex-1" onClick={() => onEdit(room)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          {room.status === "active" ? (
            <Button size="sm" variant="ghost" className="flex-1 text-red-400 hover:text-red-300" onClick={() => onEnd(room)}><Square className="h-3.5 w-3.5" /> End</Button>
          ) : (
            <Button size="sm" variant="ghost" className="flex-1 text-red-400 hover:text-red-300" onClick={() => onCancel(room)}><Trash2 className="h-3.5 w-3.5" /> Cancel</Button>
          )}
        </div>
      )}
    </Card>
  );
}

const emptyForm = {
  name: "", description: "", roomType: "meeting", access: "invite",
  capacity: 20, waitingRoom: false, requireApproval: false, password: "",
  permissions: { allowScreenShare: true, allowCam: true, joinMuted: true, allowChat: true, allowInvite: false },
};

function CreateWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [inviteLink, setInviteLink] = useState(null);
  const [createdRoom, setCreatedRoom] = useState(null);
  const [copied, setCopied] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const { room } = await roomApi.create({
        name: form.name, description: form.description, roomType: form.roomType,
        access: form.access, capacity: Number(form.capacity), waitingRoom: form.waitingRoom,
        requireApproval: form.requireApproval, password: form.password || undefined,
        permissions: form.permissions,
      });
      // For private/invite rooms, mint a shareable invite link to show on success.
      if (form.access !== "discoverable") {
        try {
          const inv = await roomApi.invite(room._id, {});
          setInviteLink(inv?.url || `${window.location.origin}/rooms/join/${inv?.linkToken}`);
        } catch { setInviteLink(`${window.location.origin}/rooms/${room._id}`); }
      }
      setCreatedRoom(room);
    } catch (e) { setErr(e?.message || "Failed to create room"); }
    finally { setBusy(false); }
  };

  const finish = () => onCreated(createdRoom);

  const steps = ["Details", "Access", "Review"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-3xl border border-white/10 bg-neutral-900 p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((s, i) => (
              <span key={s} className={cn("rounded-full px-2.5 py-1 text-xs", i === step ? "bg-cyan-500/20 text-cyan-300" : "text-white/40")}>{i + 1}. {s}</span>
            ))}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-white/50 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <label className="block text-sm text-white/70">Room name
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. BTC Strategy Session" className="mt-1" />
            </label>
            <label className="block text-sm text-white/70">Description
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30" placeholder="What's this room about?" />
            </label>
            <div className="flex gap-2">
              {["audio", "video", "meeting"].map((t) => (
                <button key={t} onClick={() => set("roomType", t)} className={cn("flex-1 rounded-xl border px-3 py-2 text-sm capitalize", form.roomType === t ? "border-cyan-400 bg-cyan-500/10 text-cyan-200" : "border-white/10 text-white/60")}>{t}</button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {["private", "invite", "discoverable"].map((a) => (
                <button key={a} onClick={() => set("access", a)} className={cn("flex-1 rounded-xl border px-2 py-2 text-xs", form.access === a ? "border-cyan-400 bg-cyan-500/10 text-cyan-200" : "border-white/10 text-white/60")}>{accessBadge[a]}</button>
              ))}
            </div>
            <label className="block text-sm text-white/70">Capacity
              <Input type="number" min={2} max={50} value={form.capacity} onChange={(e) => set("capacity", e.target.value)} className="mt-1" />
            </label>
            <label className="block text-sm text-white/70">Access code (optional)
              <Input value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Leave blank for none" className="mt-1" />
            </label>
            <div className="space-y-2">
              {[["waitingRoom", "Enable waiting room"], ["requireApproval", "Require host approval"]].map(([k, label]) => (
                <label key={k} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
                  {label}
                  <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 accent-cyan-400" />
                </label>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h4 className="font-semibold text-white">{form.name || "Untitled room"}</h4>
              <p className="mt-1 text-white/50">{form.description || "No description"}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge tone="default">{form.roomType}</Badge>
                <Badge tone="default">{accessBadge[form.access]}</Badge>
                <Badge tone="default">Up to {form.capacity}</Badge>
                {form.waitingRoom && <Badge tone="warning">Waiting room</Badge>}
                {form.requireApproval && <Badge tone="accent">Approval</Badge>}
              </div>
            </div>
            {inviteLink && (
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                <p className="mb-2 text-xs text-emerald-200">Room created. Share this invite:</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={inviteLink} className="flex-1 truncate rounded-lg bg-black/30 px-2 py-1 text-xs text-white/80" />
                  <button onClick={() => { navigator.clipboard?.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="rounded-lg bg-white/10 p-1.5 text-white/70 hover:bg-white/20" aria-label="Copy invite">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}
            {err && <p className="text-xs text-red-400">{err}</p>}
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}>{step === 0 ? "Cancel" : "Back"}</Button>
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && form.name.trim().length < 2}>Continue</Button>
          ) : inviteLink || createdRoom ? (
            <Button onClick={finish}>Done</Button>
          ) : (
            <Button onClick={submit} loading={busy}>Create room</Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function Rooms() {
  const nav = useNavigate();
  const { user } = useAuth();
  const uid = String(user?._id || user?.id || "");
  const [tab, setTab] = useState("mine");
  const [q, setQ] = useState("");
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinId, setShowJoinId] = useState(false);
  const [joinId, setJoinId] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'cancel'|'end', room }

  const load = async () => {
    setLoading(true); setErr(null);
    try { const { items } = await roomApi.list(tab, q); setRooms(items || []); }
    catch (e) { setErr(e?.message || "Failed to load rooms"); }
    finally { setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [tab, q]);

  const doConfirm = async () => {
    if (!confirm) return;
    const { kind, room } = confirm;
    setConfirm(null);
    try {
      if (kind === "cancel") await roomApi.remove(room._id);
      else await roomApi.end(room._id);
      setRooms((list) => kind === "cancel"
        ? list.filter((r) => String(r._id) !== String(room._id))
        : list.map((r) => (String(r._id) === String(room._id) ? { ...r, status: "ended" } : r)));
    } catch (e) { setErr(e?.message || "Action failed"); }
  };

  const emptyMsg = useMemo(() => ({
    mine: ["No rooms yet", "Create your first meeting room to get started."],
    upcoming: ["No upcoming meetings", "Scheduled rooms will appear here."],
    discover: ["No discoverable rooms", "Public rooms from the community will show up here."],
  }[tab]), [tab]);

  return (
    <Container className="py-8">
      <SectionHeading
        eyebrow="Rooms"
        title="Meeting rooms"
        desc="Spin up secure audio/video rooms, schedule meetings, and join with an invite."
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rooms…" className="pl-9" />
        </div>
        <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-1">
          {[["mine", "My rooms"], ["upcoming", "Upcoming"], ["discover", "Discover"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("rounded-full px-3 py-1.5 text-xs transition", tab === k ? "bg-white text-black" : "text-white/60 hover:text-white")}>{label}</button>
          ))}
        </div>
        <Button variant="secondary" onClick={() => setShowJoinId(true)}><KeyRound className="h-4 w-4" /> Join with ID</Button>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create room</Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <SkeletonLoader rows={3} />
        ) : err ? (
          <EmptyState title="Couldn't load rooms" desc={err} action={<Button onClick={load} size="sm">Retry</Button>} />
        ) : rooms.length === 0 ? (
          <EmptyState title={emptyMsg[0]} desc={emptyMsg[1]} action={<Button onClick={() => setShowCreate(true)} size="sm"><Plus className="h-4 w-4" /> Create room</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room, i) => (
              <motion.div key={room._id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <RoomCard
                  room={room}
                  isOwner={uid !== "" && String(room.ownerId) === uid}
                  onJoin={(r) => nav(`/rooms/${r._id}`)}
                  onEdit={(r) => setEditing(r)}
                  onCancel={(r) => setConfirm({ kind: "cancel", room: r })}
                  onEnd={(r) => setConfirm({ kind: "end", room: r })}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditRoomModal
          room={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setRooms((list) => list.map((r) => (String(r._id) === String(editing._id) ? { ...r, ...(typeof updated === "object" ? updated : {}) } : r)));
            setEditing(null);
          }}
        />
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 text-center">
            <h3 className="text-lg font-semibold text-white">
              {confirm.kind === "cancel" ? "Cancel this room?" : "End this room for everyone?"}
            </h3>
            <p className="mt-2 text-sm text-white/50">
              {confirm.kind === "cancel"
                ? "Members won't be able to join. This can't be undone."
                : "Everyone inside will be disconnected."}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>Keep it</Button>
              <Button onClick={doConfirm}>{confirm.kind === "cancel" ? "Yes, cancel" : "End now"}</Button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateWizard
            onClose={() => setShowCreate(false)}
            onCreated={(room) => { setShowCreate(false); nav(`/rooms/${room._id}`); }}
          />
        )}
      </AnimatePresence>

      {showJoinId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6">
            <h3 className="mb-3 text-lg font-semibold text-white">Join with room ID</h3>
            <Input value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Enter room ID" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowJoinId(false)}>Cancel</Button>
              <Button onClick={() => joinId.trim() && nav(`/rooms/${joinId.trim()}`)}>Join</Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
