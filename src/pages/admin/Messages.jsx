import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, SendHorizonal, RefreshCw } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { useAuth } from "../../context/useAuth.js";
import { Badge, Button, EmptyState, Input } from "../../components/ui.jsx";
import { PageHeader, Pagination, QueryState, RefreshButton, SearchInput } from "../../components/admin/primitives.jsx";
import { fmtDate, fmtAgo } from "../../components/admin/format.js";

export default function AdminMessages() {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [convs, setConvs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [active, setActive] = useState(null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadErr, setThreadErr] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadConvs = useCallback(() => {
    setLoading(true); setErr("");
    adminApi.conversations({ q, page, limit: 20 })
      .then(setConvs)
      .catch((e) => setErr(e?.message || "Failed to load conversations"))
      .finally(() => setLoading(false));
  }, [q, page]);

  useEffect(() => { loadConvs(); }, [loadConvs]);
  useEffect(() => { setPage(1); }, [q]);

  const loadThread = useCallback((conversationId) => {
    if (!conversationId) return;
    setThreadLoading(true); setThreadErr("");
    adminApi.thread(conversationId, { limit: 50 })
      .then((d) => setThread(d?.items || []))
      .catch((e) => setThreadErr(e?.message || "Failed to load messages"))
      .finally(() => { setThreadLoading(false); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60); });
  }, []);

  useEffect(() => { loadThread(active?._id); }, [active, loadThread]);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await adminApi.sendMessage({ conversationId: String(active._id), content: draft.trim() });
      setDraft("");
      loadThread(active._id);
      loadConvs();
    } catch (er) {
      setThreadErr(er?.message || "Send failed");
    } finally { setSending(false); }
  };

  const rows = convs?.items || [];
  const other = active?.participants?.find((p) => String(p._id) !== String(me?._id || me?.id)) || active?.participants?.[0];

  return (
    <div>
      <PageHeader
        title="Support inbox"
        desc="Direct conversations between staff and users. Messages are delivered to the user's community inbox."
        actions={<RefreshButton onClick={loadConvs} loading={loading} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px,1fr]">
        {/* Conversation list */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="border-b border-white/[0.07] p-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search people…" ariaLabel="Search conversations" />
          </div>
          <QueryState
            loading={loading && !convs} error={err} onRetry={loadConvs} rows={4}
            empty={!loading && !err && rows.length === 0}
            emptyTitle="No conversations yet"
            emptyDesc="Open a user's profile and use “Message” to start a thread."
          />
          <ul className="max-h-[540px] overflow-y-auto thin-scroll">
            {rows.map((c) => {
              const p = c.participants?.[0];
              const isActive = active && String(active._id) === String(c._id);
              return (
                <li key={c._id}>
                  <button
                    type="button"
                    onClick={() => setActive(c)}
                    className={`w-full border-b border-white/[0.05] px-4 py-3 text-left transition ${isActive ? "bg-cyan-400/10" : "hover:bg-white/[0.04]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-white">{p?.firstName ? `${p.firstName} ${p.lastName || ""}`.trim() : p?.email || "Unknown user"}</span>
                      <span className="shrink-0 text-[10px] text-white/35">{fmtAgo(c.lastMessage?.createdAt || c.updatedAt)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-white/45">{c.lastMessage?.content || "No messages yet"}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          {(convs?.pages || 1) > 1 && (
            <Pagination page={convs?.page} pages={convs?.pages} total={convs?.total} onPage={setPage} loading={loading} />
          )}
        </div>

        {/* Thread */}
        <div className="flex min-h-[540px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                title="Select a conversation"
                desc="Pick a thread on the left, or open a user profile and press Message."
              />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {other?.firstName ? `${other.firstName} ${other.lastName || ""}`.trim() : other?.email || "User"}
                  </p>
                  <p className="truncate text-xs text-white/40">{other?.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {other?.role && other.role !== "user" && <Badge tone="accent">{other.role}</Badge>}
                  {other?._id && (
                    <Link to={`/admin/users/${other._id}`} className="text-xs text-cyan-300 hover:text-cyan-200">View profile</Link>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto thin-scroll p-4">
                <QueryState loading={threadLoading} error={threadErr} onRetry={() => loadThread(active._id)} rows={3} />
                {!threadLoading && !threadErr && (thread || []).length === 0 && (
                  <p className="py-8 text-center text-xs text-white/40">No messages in this thread yet.</p>
                )}
                {(thread || []).map((m) => {
                  const mine = String(m.senderId?._id || m.senderId) === String(me?._id || me?.id);
                  return (
                    <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${mine ? "bg-cyan-400/15 text-cyan-50" : "border border-white/10 bg-white/[0.04] text-white/80"}`}>
                        <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-cyan-200/60" : "text-white/35"}`}>
                          {mine ? "staff" : m.senderId?.firstName || m.senderId?.email || "user"} · {fmtDate(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={send} className="flex items-center gap-2 border-t border-white/[0.07] p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Reply to ${other?.firstName || other?.email || "user"}…`}
                  aria-label="Message content"
                  maxLength={4000}
                />
                <Button type="submit" size="sm" disabled={sending || !draft.trim()} loading={sending}>
                  <SendHorizonal className="h-4 w-4" /> Send
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      <p className="mt-3 flex items-center gap-2 text-[11px] text-white/35">
        <RefreshCw className="h-3 w-3" aria-hidden />
        Refresh a thread to pick up replies from the user.
        <Lock className="ml-3 h-3 w-3" aria-hidden />
        Internal moderation notes stay in the admin audit log — they are never delivered to users.
      </p>
    </div>
  );
}
