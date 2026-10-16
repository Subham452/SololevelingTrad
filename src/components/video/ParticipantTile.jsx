import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { useParticipant } from "@videosdk.live/react-sdk";
import { cn } from "../../lib/utils.js";
import { Avatar } from "../community/Avatar.jsx";

// Renders one participant's webcam (or avatar fallback) + mic state.
// Uses the real SDK media streams — no fabricated video.
export default function ParticipantTile({ participantId, isLarge = false, onPin }) {
  const {
    displayName, isLocal, micStream, webcamStream, webcamOn, micOn,
    isActiveSpeaker, screenShareOn, participant,
  } = useParticipant(participantId);
  const connectionQuality = participant?.quality;
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Attach webcam stream to <video>.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (webcamStream && webcamOn) {
      const stream = new MediaStream();
      stream.addTrack(webcamStream.track);
      v.srcObject = stream;
      v.play().catch(() => setAudioBlocked(true));
    } else {
      v.srcObject = null;
    }
  }, [webcamStream, webcamOn]);

  // Autoplay remote audio (browser may block until a gesture).
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (micStream && micOn && !isLocal) {
      const stream = new MediaStream();
      stream.addTrack(micStream.track);
      a.srcObject = stream;
      a.play().catch(() => setAudioBlocked(true));
    } else {
      a.srcObject = null;
    }
  }, [micStream, micOn, isLocal]);

  const showVideo = webcamOn && webcamStream;
  const qualityColor = { GOOD: "bg-emerald-400", AVERAGE: "bg-amber-400", POOR: "bg-red-400" }[connectionQuality] || "bg-white/30";

  return (
    <div
      onClick={onPin}
      className={cn(
        "group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border bg-black/60 transition",
        isActiveSpeaker ? "border-cyan-400/70 ring-2 ring-cyan-400/30" : "border-white/10",
        isLarge ? "h-full w-full" : ""
      )}
    >
      {showVideo ? (
        <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
      ) : (
        <Avatar name={displayName || "Guest"} size={isLarge ? "xl" : "md"} />
      )}
      <audio ref={audioRef} autoPlay />

      {/* bottom overlay: name + mic */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
        <span className="truncate text-xs font-medium text-white/90">
          {displayName || "Participant"}{isLocal ? " (You)" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", qualityColor)} title={`Connection: ${connectionQuality || "unknown"}`} />
          {micOn ? <Mic className="h-3.5 w-3.5 text-white/90" /> : <MicOff className="h-3.5 w-3.5 text-red-400" />}
        </span>
      </div>

      {screenShareOn && (
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-cyan-200">Presenting</span>
      )}
      {isActiveSpeaker && (
        <Volume2 className="absolute right-2 top-2 h-4 w-4 text-cyan-300/80" />
      )}
      {audioBlocked && !isLocal && (
        <button
          onClick={(e) => { e.stopPropagation(); audioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => {}); }}
          className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white/80"
        >
          Tap to enable audio
        </button>
      )}
    </div>
  );
}
