import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Radio, Users, Signal, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { liveApi } from "../lib/comms.js";
import { api } from "../lib/api.js";
import { useAuthorizedMeeting } from "../hooks/useAuthorizedMeeting.jsx";
import PreJoin from "../components/video/PreJoin.jsx";
import MeetingView from "../components/video/MeetingView.jsx";
import { Container, Button, Badge, LoadingState, Card } from "../components/ui.jsx";
import { useAuth } from "../context/useAuth.js";
import EditLiveModal from "../components/video/EditLiveModal.jsx";

// Host Live Studio. The session only becomes "live" (and discoverable) after
// the backend confirms startLive() succeeded — never optimistically.
export default function LiveStudio() {
  const { liveId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [live, setLive] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [state, setState] = useState("loading"); // loading | lobby | rejoining | live | error
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const meeting = useAuthorizedMeeting();
  const liveKey = `slt_live_${liveId}_inroom`;

  const attachMedia = async () => {
    await meeting.join(() => liveApi.join(liveId));
    sessionStorage.setItem(liveKey, "1");
    setState("live");
  };

  const load = () => liveApi.get(liveId).then(async (res) => {
    const lv = res?.live || res;
    setLive(lv);
    setIsHost(!!res?.isHost);
    // Refresh mid-broadcast: re-attach media directly instead of landing on
    // the pre-live lobby (start is idempotent server-side, but no need to
    // call it — just join media).
    if (lv?.status === "live" && sessionStorage.getItem(liveKey)) {
      setState("rejoining");
      try { await attachMedia(); }
      catch (e) { sessionStorage.removeItem(liveKey); setError(e?.message || "Failed to rejoin"); setState("lobby"); }
      return;
    }
    setState((s) => (s === "loading" ? "lobby" : s));
  })
    .catch((e) => { setError(e?.message || "Session not found"); setState("error"); });

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [liveId]);

  // Best-effort server leave when the tab closes mid-broadcast.
  useEffect(() => {
    if (state !== "live") return;
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
  }, [state, liveId]);

  const goLive = async () => {
    setStarting(true); setError(null);
    try {
      // Start first (server flips status; idempotent if already live), then join media.
      await liveApi.start(liveId);
      await attachMedia();
    } catch (e) { setError(e?.message || "Failed to start"); }
    finally { setStarting(false); }
  };

  const endLive = async () => {
    try { await liveApi.end(liveId); } catch { /* ignore */ }
    sessionStorage.removeItem(liveKey); meeting.reset(); nav("/live");
  };

  const cancelSession = async () => {
    setConfirmCancel(false);
    try { await liveApi.cancel(liveId); nav("/live"); }
    catch (e) { setError(e?.message || "Failed to cancel"); }
  };

  if (state === "loading" || state === "rejoining") return <Container className="py-16"><LoadingState label={state === "rejoining" ? "Rejoining broadcast…" : undefined} /></Container>;
  if (state === "error") return (
    <Container className="py-16"><div className="mx-auto max-w-md rounded-2xl border border-white/10 p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-300" />
      <h2 className="mb-2 text-lg font-semibold text-white">Studio unavailable</h2>
      <p className="mb-6 text-sm text-white/50">{error}</p>
      <Button onClick={() => nav("/live")}>Back to live</Button>
    </div></Container>
  );

  if (state === "live" && meeting.status === "joined") {
    return (
      <div className="fixed inset-0 z-40 bg-neutral-950">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> LIVE · {live?.title}
          </span>
          <div className="flex items-center gap-3">
            <Badge tone="default"><Users className="h-3 w-3" /> {live?.viewerCount || 0}</Badge>
            <Badge tone="success"><Signal className="h-3 w-3" /> {live?.broadcastMode?.toUpperCase()}</Badge>
          </div>
        </header>
        <meeting.Provider>
          <div className="h-[calc(100%-56px)]">
            <MeetingView canEndForEveryone onEndForEveryone={endLive} onLeave={() => { sessionStorage.removeItem(liveKey); meeting.reset(); nav("/live"); }} />
          </div>
        </meeting.Provider>
      </div>
    );
  }

  // lobby / pre-live
  return (
    <div>
      <Container className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => nav("/live")} className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white">← Live</button>
          {isHost && live?.status === "scheduled" && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setConfirmCancel(true)}><Trash2 className="h-3.5 w-3.5" /> Cancel session</Button>
            </div>
          )}
        </div>
      </Container>
      <PreJoin
        roomName={live?.title || "Live session"}
        hostName={user?.firstName || user?.username}
        displayName={user?.firstName || user?.username}
        accessLabel={`${live?.category || ""} · ${live?.access || ""}`}
        onJoin={goLive}
        joining={starting}
        error={error}
      />
      <Container className="pb-8">
        <Card className="mx-auto max-w-2xl">
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Radio className="h-4 w-4 text-red-400" />
            Pressing “Join” starts the broadcast and makes this session visible as <strong className="text-white">Live</strong> to your audience.
          </div>
        </Card>
      </Container>

      {editing && (
        <EditLiveModal
          live={live}
          onClose={() => setEditing(false)}
          onSaved={(updated) => { if (updated && updated.title) setLive((l) => ({ ...l, ...updated })); else load(); setEditing(false); }}
        />
      )}

      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 text-center">
            <h3 className="text-lg font-semibold text-white">Cancel this session?</h3>
            <p className="mt-2 text-sm text-white/50">It will be removed from listings. This can't be undone.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep it</Button>
              <Button onClick={cancelSession}>Yes, cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
