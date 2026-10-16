import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarClock, ShieldCheck, Pencil, Trash2 } from "lucide-react";
import { roomApi } from "../lib/comms.js";
import { api } from "../lib/api.js";
import { useAuthorizedMeeting } from "../hooks/useAuthorizedMeeting.jsx";
import PreJoin from "../components/video/PreJoin.jsx";
import MeetingView from "../components/video/MeetingView.jsx";
import { Container, Button, Badge, LoadingState } from "../components/ui.jsx";
import EditRoomModal from "../components/video/EditRoomModal.jsx";
import { useAuth } from "../context/useAuth.js";
export default function RoomSession() {
  // Supports both /rooms/:roomId and /rooms/join/:token (invite links).
  const { roomId: routeRoomId, token } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [roomId, setRoomId] = useState(routeRoomId || null);
  const [view, setView] = useState("loading"); // loading | lobby | rejoining | waiting | inroom | error
  const [error, setError] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const meeting = useAuthorizedMeeting();
  const inroomKey = `slt_room_${routeRoomId || token}_inroom`;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (token) {
        // Resolve the invite token into a real room (server validates + records
        // acceptance) before showing the lobby.
        const res = await roomApi.joinByToken(token);
        const r = res?.room || res;
        if (!alive) return;
        setRoomId(String(r._id));
        setRoom(r);
        setView("lobby");
        return;
      }
      const res = await roomApi.get(routeRoomId);
      const r = res?.room || res;
      if (!alive) return;
      setRoomId(String(r._id));
      setRoom(r);
      setIsOwner(!!res?.isOwner);
      // Refresh mid-meeting: skip the lobby and rejoin media directly with a
      // fresh token (rejoin is idempotent server-side).
      if (sessionStorage.getItem(inroomKey)) {
        setView("rejoining");
        try {
          const result = await meeting.join(() => roomApi.join(String(r._id)));
          if (!alive) return;
          if (result?.status === "pending_approval") { setView("waiting"); return; }
          setView("inroom");
        } catch (e) {
          if (!alive) return;
          sessionStorage.removeItem(inroomKey);
          setError(e?.message || "Failed to rejoin");
          setView("lobby");
        }
        return;
      }
      setView("lobby");
    };
    load().catch((e) => { if (alive) { setError(e?.message || "Room not found"); setView("error"); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeRoomId, token]);

  // Mark the server row left when the tab closes mid-meeting (best-effort;
  // the flag above lets a refresh rejoin cleanly either way).
  useEffect(() => {
    if (view !== "inroom" || !roomId) return;
    const onUnload = () => {
      try {
        fetch(`${api.base}/rooms/${roomId}/leave`, {
          method: "POST", credentials: "include", keepalive: true,
          headers: { "Content-Type": "application/json" }, body: "{}",
        });
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [view, roomId]);

  const doJoin = async () => {
    setError(null);
    if (!roomId) return;
    try {
      const result = await meeting.join(() => roomApi.join(roomId));
      if (result?.status === "pending_approval") { setView("waiting"); return; }
      sessionStorage.setItem(inroomKey, "1");
      setView("inroom");
    } catch (e) {
      setError(e?.message || "Failed to join");
    }
  };

  const leaveToRooms = () => { sessionStorage.removeItem(inroomKey); meeting.reset(); nav("/rooms"); };

  const endForEveryone = async () => {
    try { if (roomId) await roomApi.end(roomId); } catch { /* ignore */ }
    sessionStorage.removeItem(inroomKey); meeting.reset(); nav("/rooms");
  };

  if (view === "loading" || view === "rejoining") {
    return <Container className="py-16"><LoadingState label={view === "rejoining" ? "Rejoining meeting…" : undefined} /></Container>;
  }
  if (view === "error") {
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold text-white">Can't open this room</h2>
          <p className="mb-6 text-sm text-white/50">{error}</p>
          <Button onClick={() => nav("/rooms")}><ArrowLeft className="h-4 w-4" /> Back to rooms</Button>
        </div>
      </Container>
    );
  }

  if (view === "waiting") {
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 p-8 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-amber-300" />
          <h2 className="mb-2 text-lg font-semibold text-white">Waiting for approval</h2>
          <p className="mb-6 text-sm text-white/50">The host will let you in shortly. You can try joining again once approved.</p>
          <Button variant="secondary" onClick={() => nav("/rooms")}>Back to rooms</Button>
        </div>
      </Container>
    );
  }

  if (view === "inroom" && meeting.status === "joined") {
    const isHost = meeting.role === "host" || meeting.role === "cohost";
    return (
      <div className="fixed inset-0 z-40 bg-neutral-950">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h1 className="truncate text-sm font-semibold text-white">{room?.name}</h1>
          <Badge tone="default">{meeting.role}</Badge>
        </header>
        <meeting.Provider>
          <div className="h-[calc(100%-56px)]">
            <MeetingView
              canEndForEveryone={isHost}
              onEndForEveryone={endForEveryone}
              onLeave={leaveToRooms}
            />
          </div>
        </meeting.Provider>
      </div>
    );
  }

  // lobby
  const cancelRoom = async () => {
    setConfirmCancel(false);
    try { await roomApi.remove(roomId); nav("/rooms"); }
    catch (e) { setError(e?.message || "Failed to cancel room"); }
  };
  return (
    <div>
      <Container className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => nav("/rooms")} className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Rooms
          </button>
          {isOwner && (room?.status === "scheduled" || room?.status === "waiting") && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setConfirmCancel(true)}><Trash2 className="h-3.5 w-3.5" /> Cancel room</Button>
            </div>
          )}
        </div>
      </Container>
      <PreJoin
        roomName={room?.name || "Room"}
        hostName={room?.ownerId?.firstName || room?.ownerName}
        displayName={user?.firstName || user?.username}
        accessLabel={room?.access === "private" ? "Private" : room?.access === "invite" ? "Invite only" : "Discoverable"}
        onJoin={doJoin}
        joining={meeting.status === "connecting"}
        error={error}
      />
      {room?.scheduledStartAt && room?.status === "scheduled" && (
        <Container className="pb-8 text-center">
          <p className="inline-flex items-center gap-2 text-xs text-amber-300">
            <CalendarClock className="h-4 w-4" /> Scheduled for {new Date(room.scheduledStartAt).toLocaleString()}
          </p>
        </Container>
      )}
      {editing && room && (
        <EditRoomModal
          room={room}
          onClose={() => setEditing(false)}
          onSaved={(updated) => { if (updated && updated.name) setRoom((r) => ({ ...r, ...updated })); setEditing(false); }}
        />
      )}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 text-center">
            <h3 className="text-lg font-semibold text-white">Cancel this room?</h3>
            <p className="mt-2 text-sm text-white/50">Members won't be able to join. This can't be undone.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep it</Button>
              <Button onClick={cancelRoom}>Yes, cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
