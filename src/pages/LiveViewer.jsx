import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Send, Users, ArrowLeft, Flag } from "lucide-react";
import { liveApi } from "../lib/comms.js";
import { api } from "../lib/api.js";
import { Avatar } from "../components/community/Avatar.jsx";
import { Container, Button, Badge, LoadingState } from "../components/ui.jsx";
import { cn } from "../lib/utils.js";

// Audience viewer. HLS playback is wired once the host starts a broadcast; for
// RTC-based sessions the host's video renders via the shared participant tile.
// We only show a real HLS URL when the backend reports one — never fake video.
function HLSPlayer({ src }) {
  const ref = useRef(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let hls;
    if (src && ref.current) {
      import("hls.js").then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(src);
          hls.attachMedia(ref.current);
          hls.on(Hls.Events.ERROR, (_e, data) => { if (data?.fatal) setErr("Stream unavailable"); });
        } else if (ref.current.canPlayType("application/vnd.apple.mpegurl")) {
          ref.current.src = src;
        } else setErr("HLS not supported in this browser");
      }).catch(() => setErr("Failed to load player"));
    }
    return () => hls?.destroy();
  }, [src]);
  if (err) return <div className="flex aspect-video items-center justify-center rounded-2xl bg-black/60 text-sm text-white/50">{err}</div>;
  return <video ref={ref} className="aspect-video w-full rounded-2xl bg-black object-contain" autoPlay playsInline controls />;
}

export default function LiveViewer() {
  const { liveId } = useParams();
  const nav = useNavigate();
  const [live, setLive] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [joined, setJoined] = useState(false);
  const joinedKey = `slt_live_${liveId}_joined`;

  useEffect(() => {
    let alive = true;
    liveApi.get(liveId).then((res) => {
      if (!alive) return;
      const lv = res?.live || res;
      setLive(lv);
      // Refresh mid-stream: restore the audience seat without forcing the
      // user back through the Join button (rejoin is idempotent server-side
      // and no longer inflates the viewer count).
      if (lv?.status === "live" && sessionStorage.getItem(joinedKey)) {
        liveApi.join(liveId).then(() => { if (alive) setJoined(true); })
          .catch(() => { sessionStorage.removeItem(joinedKey); });
      }
      setState("ready");
    })
      .catch((e) => { if (alive) { setError(e?.message || "Session not found"); setState("error"); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId]);

  // Best-effort server leave when the tab closes mid-stream.
  useEffect(() => {
    if (!joined) return;
    const onUnload = () => {
      try {
        fetch(`${api.base}/live/${liveId}/leave`, {
          method: "POST", credentials: "include", keepalive: true,
          headers: { "Content-Type": "application/json" }, body: "{}",
        });
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [joined, liveId]);

  // Poll chat only while joined + live (simple, real messages from backend).
  useEffect(() => {
    if (!joined) return;
    let alive = true;
    const tick = async () => {
      try { const { items } = await liveApi.chat(liveId); if (alive) setMessages((items || []).slice().reverse()); } catch { /* ignore */ }
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [joined, liveId]);

  const join = async () => {
    try { await liveApi.join(liveId); sessionStorage.setItem(joinedKey, "1"); setJoined(true); } catch (e) { setError(e?.message || "Unable to join"); }
  };
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const optimistic = { message: text.trim(), senderName: "You", temp: true };
    setMessages((m) => [...m, optimistic]); setText("");
    try { await liveApi.sendChat(liveId, { content: optimistic.message, type: "message" }); } catch { /* ignore */ }
  };

  if (state === "loading") return <Container className="py-16"><LoadingState /></Container>;
  if (state === "error") return (
    <Container className="py-16"><div className="mx-auto max-w-md rounded-2xl border border-white/10 p-8 text-center">
      <h2 className="mb-2 text-lg font-semibold text-white">Can't open this session</h2>
      <p className="mb-6 text-sm text-white/50">{error}</p>
      <Button onClick={() => nav("/live")}><ArrowLeft className="h-4 w-4" /> Back to live</Button>
    </div></Container>
  );

  return (
    <Container className="py-6">
      <button onClick={() => nav("/live")} className="mb-3 inline-flex items-center gap-1 text-sm text-white/50 hover:text-white"><ArrowLeft className="h-4 w-4" /> Live</button>
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div>
          {live?.hlsUrl ? <HLSPlayer src={live.hlsUrl} /> : (
            <div className="flex aspect-video items-center justify-center rounded-2xl border border-white/10 bg-black/50 text-center">
              <div>
                <p className="text-sm text-white/60">{live?.status === "live" ? "Stream is starting…" : live?.status === "ended" ? "This session has ended." : "Session hasn't started yet."}</p>
                {!joined && live?.status === "live" && <Button size="sm" className="mt-3" onClick={join}>Join audience</Button>}
              </div>
            </div>
          )}
          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar name={live?.hostName || "Host"} size="md" id={live?.hostId} />
              <div>
                <h1 className="text-xl font-semibold text-white">{live?.title}</h1>
                <p className="text-sm text-white/50">{live?.hostName || "Host"} · {live?.category}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {live?.status === "live" && <Badge tone="danger"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> Live</Badge>}
              <Badge tone="default"><Users className="h-3 w-3" /> {live?.viewerCount || 0}</Badge>
              <button aria-label="Report" className="rounded-full p-2 text-white/40 hover:bg-white/10"><Flag className="h-4 w-4" /></button>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-white/70">{live?.description}</p>
        </div>

        {/* chat panel */}
        <aside className="flex h-[560px] flex-col rounded-2xl border border-white/10 bg-neutral-900/60">
          <header className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">Live chat</header>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("text-sm", m.type === "announcement" && "rounded-lg bg-cyan-500/10 px-2 py-1 text-cyan-200")}>
                <span className="mr-1.5 font-semibold text-cyan-300">{m.senderName || m.userId?.firstName || "Guest"}{m.type === "question" ? " ❓" : ""}</span>
                <span className="text-white/85">{m.message || m.content}</span>
              </div>
            ))}
            {!messages.length && <p className="pt-8 text-center text-xs text-white/40">Chat is {live?.chatEnabled === false ? "disabled" : "quiet"}</p>}
          </div>
          <form onSubmit={send} className="flex items-center gap-2 border-t border-white/10 p-2">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={joined ? "Say something…" : "Join to chat"} disabled={!joined} className="flex-1 rounded-full bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 disabled:opacity-50" />
            <button type="submit" disabled={!joined} aria-label="Send" className="rounded-full bg-cyan-500 p-2 text-black disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </form>
        </aside>
      </div>
    </Container>
  );
}
