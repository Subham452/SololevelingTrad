import { useEffect, useRef, useState } from "react";
import { Search, Phone, Video, X } from "lucide-react";
import { communityApi } from "../../lib/community.js";
import { useCall } from "./useCall.js";
import { Avatar } from "../community/Avatar.jsx";

// Real 1:1 call launcher: search a user → open/reuse a direct conversation →
// start an audio or video call via the backend. No fake participants.
export default function NewCallDialog({ onClose }) {
  const { startCall } = useCall();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) { setUsers([]); return; }
    const t = setTimeout(() => {
      communityApi.searchUsers(q.trim()).then((d) => setUsers(d?.items || [])).catch(() => setUsers([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const call = async (user, type) => {
    setBusy(user._id); setErr(null);
    try {
      const { _id: convId } = await communityApi.startDirect(user._id);
      await startCall(convId, type);
      onClose();
    } catch (e) { setErr(e?.message || "Could not start call"); }
    finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 p-4 pt-24" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={boxRef} className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Start a call</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-white/50 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </header>
        <div className="relative border-b border-white/10">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people to call…" className="w-full bg-transparent py-3 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:outline-none" />
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {users.map((u) => (
            <div key={u._id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
              <Avatar src={u.avatar} name={u.firstName || u.username} username={u.username} id={u._id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : u.username}</p>
                <p className="truncate text-xs text-white/40">@{u.username}</p>
              </div>
              <button onClick={() => call(u, "audio")} disabled={busy === u._id} aria-label="Audio call" className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-50"><Phone className="h-4 w-4" /></button>
              <button onClick={() => call(u, "video")} disabled={busy === u._id} aria-label="Video call" className="rounded-full bg-cyan-500/20 p-2 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50"><Video className="h-4 w-4" /></button>
            </div>
          ))}
          {q.trim().length >= 2 && !users.length && <p className="px-3 py-8 text-center text-xs text-white/40">No users found</p>}
          {q.trim().length < 2 && <p className="px-3 py-8 text-center text-xs text-white/40">Search by name or username</p>}
          {err && <p className="px-3 py-2 text-xs text-red-400">{err}</p>}
        </div>
      </div>
    </div>
  );
}
