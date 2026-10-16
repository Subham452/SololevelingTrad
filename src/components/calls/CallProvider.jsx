import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { callApi } from "../../lib/comms.js";
import { connectCommunitySocket } from "../../lib/community.js";
import { Avatar } from "../community/Avatar.jsx";
import { useAuth } from "../../context/useAuth.js";

export const CallCtx = createContext(null);

// Global 1:1 call controller. Listens for call:incoming on the user's personal
// socket room, drives accept/reject/cancel/end against the backend, and renders
// the overlay. Real VideoSDK media is mounted in CallRoom once accepted.
export function CallProvider({ children }) {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState(null);   // ringing call we received
  const [outgoing, setOutgoing] = useState(null);   // ringing call we placed
  const [active, setActive] = useState(null);       // accepted call
  const [status, setStatus] = useState("idle");     // idle|calling|ringing|connecting|in-call|ended
  const [error, setError] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const timerRef = useRef(null);
  const outgoingRef = useRef(null);
  useEffect(() => { outgoingRef.current = outgoing; }, [outgoing]);

  // Socket: subscribe to incoming calls + call lifecycle for this user.
  useEffect(() => {
    let socket;
    let cancelled = false;
    connectCommunitySocket().then((s) => {
      if (cancelled) { return; }
      socket = s;
      socket.on("call:incoming", ({ call }) => {
        // Ignore our own outgoing echo.
        if (call?.initiatorId !== user?._id) setIncoming(call);
      });
      socket.on("call:accepted", ({ call }) => {
        if (call && outgoingRef.current && call._id === outgoingRef.current._id) {
          setActive(call);
          setStatus("in-call");
          setOutgoing(null);
        }
        setIncoming(null);
      });
      socket.on("call:rejected", () => { setOutgoing(null); setStatus("idle"); });
      socket.on("call:cancelled", () => { setIncoming(null); setStatus("idle"); });
      socket.on("call:ended", () => { setActive(null); setIncoming(null); setOutgoing(null); setStatus("ended"); setTimeout(() => setStatus("idle"), 2000); });
    }).catch(() => {});
    return () => { cancelled = true; socket?.off("call:incoming"); socket?.off("call:accepted"); socket?.off("call:rejected"); socket?.off("call:cancelled"); socket?.off("call:ended"); };
  }, [user?._id]);

  const startCall = useCallback(async (conversationId, type = "video") => {
    setError(null);
    try {
      const { call } = await callApi.start(conversationId, type);
      setOutgoing(call); setStatus("calling");
      // auto-timeout if not answered in 45s
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        setOutgoing((o) => { if (o && o.status === "ringing") { callApi.cancel(o._id).catch(() => {}); } return null; });
        setStatus("idle");
      }, 45000);
      return call;
    } catch (e) { setError(e?.message || "Could not start call"); return null; }
  }, []);

  const accept = useCallback(async () => {
    if (!incoming) return;
    try {
      const { call } = await callApi.accept(incoming._id);
      setActive(call); setStatus("in-call"); setIncoming(null);
    } catch (e) { setError(e?.message); setIncoming(null); }
  }, [incoming]);

  const reject = useCallback(async () => { if (incoming) { callApi.reject(incoming._id).catch(() => {}); setIncoming(null); setStatus("idle"); } }, [incoming]);
  const cancel = useCallback(async () => { if (outgoing) { callApi.cancel(outgoing._id).catch(() => {}); } clearTimeout(timerRef.current); setOutgoing(null); setStatus("idle"); }, [outgoing]);
  const hangUp = useCallback(async () => {
    const call = active || outgoing;
    if (call) { callApi.end(call._id).catch(() => {}); }
    setActive(null); setOutgoing(null); setStatus("ended"); setTimeout(() => setStatus("idle"), 2000);
  }, [active, outgoing]);

  const value = { status, active, incoming, outgoing, error, micOn, setMicOn, startCall, accept, reject, cancel, hangUp };

  return (
    <CallCtx.Provider value={value}>
      {children}
      {/* Incoming call ring */}
      <AnimatePresence>
        {incoming && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="fixed left-1/2 top-6 z-[60] w-80 -translate-x-1/2 rounded-2xl border border-white/10 bg-neutral-900/95 p-4 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-3">
              <Avatar name="Incoming call" size="md" id={incoming._id} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Incoming {incoming.type} call</p>
                <p className="text-xs text-white/50">is calling…</p>
              </div>
            </div>
            <div className="mt-4 flex justify-center gap-4">
              <button onClick={reject} aria-label="Decline" className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"><PhoneOff className="h-5 w-5" /></button>
              <button onClick={accept} aria-label="Accept" className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400"><Phone className="h-5 w-5" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Outgoing call / in-call control overlay */}
      <AnimatePresence>
        {(outgoing || active) && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-[60] w-72 rounded-2xl border border-white/10 bg-neutral-900/95 p-4 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-3">
              <Avatar name="Call" size="md" id={active?._id || outgoing?._id} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{status === "calling" ? "Calling…" : status === "in-call" ? "In call" : "Connecting…"}</p>
                <p className="text-xs text-white/50">{outgoing?.type || active?.type} call</p>
              </div>
              {status === "in-call" && (
                <button onClick={() => setMicOn((v) => !v)} aria-label={micOn ? "Mute" : "Unmute"} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
                  {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-red-400" />}
                </button>
              )}
            </div>
            <button onClick={hangUp} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-500">
              <PhoneOff className="h-4 w-4" /> {status === "calling" ? "Cancel" : "End call"}
            </button>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </CallCtx.Provider>
  );
}
