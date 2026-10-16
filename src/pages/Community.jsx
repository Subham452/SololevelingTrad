import { useEffect, useRef, useState } from "react";
import { Plus, Send } from "lucide-react";
import { groupApi, connectSocket } from "../lib/groups.js";
import { useAuth } from "../context/useAuth.js";
import { Container, Section, Card, Button, Input, Badge, EmptyState } from "../components/ui.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import { cn } from "../lib/utils.js";

function Bubble({ m, mine, onEdit, onDelete }) {
  return (
    <div className={cn("group flex max-w-[80%] flex-col gap-1", mine && "ml-auto items-end")}>
      <div className={cn("rounded-2xl px-3.5 py-2 text-sm", mine ? "rounded-br-sm bg-blue-600/80 text-white" : "rounded-bl-sm border border-white/10 bg-white/5 text-white/85")}>
        {!m.deleted ? m.content : <span className="italic text-white/40">message deleted</span>}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-white/35">
        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        {m.edited && <span>(edited)</span>}
        {mine && !m.deleted && (
          <span className="flex gap-1.5 opacity-0 transition group-hover:opacity-100">
            <button onClick={() => onEdit(m)} className="text-white/50 hover:text-white">edit</button>
            <button onClick={() => onDelete(m)} className="text-white/50 hover:text-red-300">delete</button>
          </span>
        )}
      </div>
    </div>
  );
}

export default function Community() {
  const { user } = useAuth();
  const [groups, setGroups] = useState(null);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [members, setMembers] = useState([]);
  const [socket, setSocket] = useState(null);
  const [toast, setToast] = useState("");
  const endRef = useRef(null);
  const notify = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  useEffect(() => { groupApi.list().then((d) => setGroups(d?.groups || [])).catch(() => setGroups([])); }, []);

  useEffect(() => {
    if (!user) return;
    let s;
    connectSocket(null).then((sock) => {
      s = sock;
      setSocket(sock);
      sock.on("group:message", ({ groupId, message }) => { if (groupId === active) setMsgs((p) => [message, ...(p || [])]); });
    }).catch(() => {});
    return () => { s?.disconnect(); };
  }, [user, active]);

  useEffect(() => {
    if (!active) return;
    socket?.emit("group:join", active);
    groupApi.messages(active).then((d) => setMsgs(d?.items || [])).catch(() => setMsgs([]));
    groupApi.members(active).then((d) => setMembers(d?.members || [])).catch(() => setMembers([]));
    groupApi.read(active).catch(() => {});
  }, [active, socket]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active) return;
    const content = text.trim();
    setText("");
    try { const d = await groupApi.send(active, { content }); setMsgs((p) => [d?.message, ...(p || [])]); }
    catch (err) { notify(err?.message || "Send failed"); }
  };

  const create = async () => {
    const name = prompt("Group name");
    if (!name) return;
    try { const d = await groupApi.create({ name, description: "" }); setGroups((p) => [d?.group, ...(p || [])]); setActive(d?.group?._id); }
    catch (err) { notify(err?.message || "Create failed"); }
  };

  const join = async () => {
    const code = prompt("Invite code");
    if (!code) return;
    try { const d = await groupApi.join(code.trim()); setGroups((p) => [d?.group, ...(p || [])]); setActive(d?.group?._id); }
    catch (err) { notify(err?.message || "Join failed"); }
  };

  const mine = (m) => String(m.userId?._id || m.userId) === String(user?.id || user?._id);
  const editMsg = async (m) => { const c = prompt("Edit message", m.content); if (c) { const d = await groupApi.edit(m._id, c); setMsgs((p) => p.map((x) => (x._id === d.message._id ? d.message : x))); } };
  const delMsg = async (m) => { const d = await groupApi.remove(m._id); setMsgs((p) => p.map((x) => (x._id === d.message._id ? d.message : x))); };

  return (
    <Section><Container>
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm text-red-200">{toast}</div>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-semibold text-white">Groups & Community</h1><p className="mt-1 text-xs text-white/50">Real-time chat. Only members can read or post.</p></div>
        <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={join}>Join</Button><Button size="sm" onClick={create}><Plus size={14} /> New group</Button></div>
      </div>

      {groups === null ? <div className="mt-4"><SkeletonLoader rows={3} /></div> : groups.length === 0 ? (
        <div className="mt-4"><EmptyState title="No groups yet" desc="Create a group or join with an invite code." action={<Button size="sm" onClick={create}>Create group</Button>} /></div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-[240px_1fr_200px]">
          <Card className="bg-white/[0.02] backdrop-blur-xl">
            <p className="text-[11px] uppercase tracking-widest text-white/40">Groups</p>
            <ul className="mt-2 space-y-1">{groups.map((g) => (
              <li key={g._id}>
                <button onClick={() => setActive(g._id)} className={cn("w-full rounded-lg px-3 py-2 text-left text-sm", active === g._id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5")}>
                  <span className="flex items-center justify-between"><span className="truncate">{g.name}</span>{g.role && <Badge tone={g.role === "owner" ? "accent" : "default"}>{g.role}</Badge>}</span>
                </button>
              </li>))}</ul>
          </Card>

          <Card className="flex flex-col bg-white/[0.02] backdrop-blur-xl" style={{ minHeight: "440px" }}>
            {!active ? <div className="m-auto"><EmptyState title="Select a group" desc="Pick a group on the left to start chatting." /></div> : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto" style={{ maxHeight: "360px" }}>
                  {msgs === null ? <SkeletonLoader rows={5} /> : msgs.length === 0 ? <p className="py-8 text-center text-xs text-white/40">No messages yet. Say hi!</p> : msgs.map((m) => <Bubble key={m._id} m={m} mine={mine(m)} onEdit={editMsg} onDelete={delMsg} />)}
                  <div ref={endRef} />
                </div>
                <form onSubmit={send} className="mt-3 flex gap-2">
                  <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" aria-label="Message" maxLength={2000} />
                  <Button type="submit" disabled={!text.trim()} aria-label="Send"><Send size={14} /></Button>
                </form>
              </>
            )}
          </Card>

          <Card className="bg-white/[0.02] backdrop-blur-xl">
            <p className="text-[11px] uppercase tracking-widest text-white/40">Members</p>
            <ul className="mt-2 space-y-1.5">{members.map((m) => (
              <li key={m._id} className="flex items-center justify-between text-xs text-white/60">
                <span className="truncate">{m.userId?.firstName || "Member"}</span>
                {m.role !== "member" && <Badge>{m.role}</Badge>}
              </li>))}</ul>
            {members.length === 0 && <p className="mt-2 text-xs text-white/40">—</p>}
          </Card>
        </div>
      )}
    </Container></Section>
  );
}
