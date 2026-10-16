import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, LogIn, Settings2 } from "lucide-react";
import { Avatar } from "../community/Avatar.jsx";
import { cn } from "../../lib/utils.js";

// Pre-join lobby: real getUserMedia preview + device selection + mic level.
// Does NOT join the VideoSDK room — that happens on "Join".
export default function PreJoin({ roomName, hostName, displayName, onJoin, joining, error, accessLabel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [devices, setDevices] = useState({ cams: [], mics: [] });
  const [camId, setCamId] = useState("");
  const [micId, setMicId] = useState("");
  const [level, setLevel] = useState(0);
  const [mediaError, setMediaError] = useState(null);

  const startMedia = async () => {
    stopMedia();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camOn ? (camId ? { deviceId: { exact: camId } } : true) : false,
        audio: micOn ? (micId ? { deviceId: { exact: micId } } : true) : false,
      });
      streamRef.current = stream;
      if (videoRef.current && camOn) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      setMediaError(null);
      // mic level meter
      if (micOn) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          if (!streamRef.current) { ctx.close(); return; }
          an.getByteFrequencyData(data);
          setLevel(Math.min(100, Math.round((data.reduce((a, b) => a + b, 0) / data.length / 255) * 200)));
          requestAnimationFrame(tick);
        };
        tick();
      }
    } catch (e) {
      setMediaError(e?.name === "NotAllowedError" ? "Camera/microphone access denied. You can still join without them." : "No camera/microphone found.");
    }
  };
  const stopMedia = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices?.enumerateDevices?.().then((list) => {
      if (cancelled) return;
      setDevices({
        cams: list.filter((d) => d.kind === "videoinput"),
        mics: list.filter((d) => d.kind === "audioinput"),
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { startMedia(); return stopMedia; /* eslint-disable-next-line */ }, [camOn, micOn, camId, micId]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-neutral-900/70 p-6 backdrop-blur">
        <div className="mb-5 flex items-center gap-3">
          <Avatar name={hostName || roomName} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-white">{roomName}</h1>
            <p className="text-sm text-white/50">{hostName ? `Hosted by ${hostName}` : "Meeting"}{accessLabel ? ` · ${accessLabel}` : ""}</p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-[1.5fr_1fr]">
          {/* preview */}
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
            {camOn ? (
              <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Avatar name={displayName || "You"} size="xl" />
              </div>
            )}
            {mediaError && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-white/60">{mediaError}</div>}
            {/* mic level bar */}
            <div className="absolute bottom-2 left-2 right-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width]" style={{ width: `${level}%` }} />
            </div>
          </div>

          {/* controls */}
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                onClick={() => setMicOn((v) => !v)}
                aria-label={micOn ? "Mute" : "Unmute"}
                className={cn("flex h-12 flex-1 items-center justify-center rounded-xl border transition", micOn ? "border-white/15 bg-white/5 text-white" : "border-red-500/40 bg-red-600/20 text-red-300")}
              >
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              <button
                onClick={() => setCamOn((v) => !v)}
                aria-label={camOn ? "Camera off" : "Camera on"}
                className={cn("flex h-12 flex-1 items-center justify-center rounded-xl border transition", camOn ? "border-white/15 bg-white/5 text-white" : "border-red-500/40 bg-red-600/20 text-red-300")}
              >
                {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </button>
            </div>

            <details className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <summary className="flex cursor-pointer items-center gap-2 text-white/70"><Settings2 className="h-4 w-4" /> Devices</summary>
              <div className="mt-3 space-y-2">
                <select value={camId} onChange={(e) => setCamId(e.target.value)} className="w-full rounded-lg bg-neutral-800 px-2 py-1.5 text-xs text-white">
                  <option value="">Default camera</option>
                  {devices.cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera"}</option>)}
                </select>
                <select value={micId} onChange={(e) => setMicId(e.target.value)} className="w-full rounded-lg bg-neutral-800 px-2 py-1.5 text-xs text-white">
                  <option value="">Default microphone</option>
                  {devices.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}
                </select>
              </div>
            </details>

            <p className="text-xs text-white/50">Joining as <span className="text-white/80">{displayName || "You"}</span></p>
            <button
              onClick={() => onJoin({ micOn, camOn })}
              disabled={joining}
              className="mt-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold text-white transition hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
            >
              {joining ? "Joining…" : <><LogIn className="h-5 w-5" /> Join room</>}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
