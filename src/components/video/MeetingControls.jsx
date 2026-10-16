import { useState } from "react";
import {
  Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff,
  PhoneOff, Users, MessageSquare, Maximize,
} from "lucide-react";
import { useMeeting } from "@videosdk.live/react-sdk";
import { cn } from "../../lib/utils.js";

function CtrlBtn({ onClick, active, danger, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "relative flex h-12 w-12 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
        danger ? "bg-red-600 text-white hover:bg-red-500"
          : active === false ? "bg-white/10 text-white/50 hover:bg-white/15"
          : "bg-white/15 text-white hover:bg-white/25"
      )}
    >
      {children}
    </button>
  );
}

// Bottom control bar for an active meeting. Real SDK toggles only.
export default function MeetingControls({ onTogglePanel, panel, onLeave, canEndForEveryone, onEndForEveryone }) {
  const {
    leave, toggleMic, toggleWebcam, toggleScreenShare,
    localMicOn, localWebcamOn, localScreenShareOn,
  } = useMeeting();
  const micOn = localMicOn;
  const camOn = localWebcamOn;
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  return (
    <>
      <div className="flex items-center justify-center gap-3">
        <CtrlBtn onClick={toggleMic} active={micOn} label={micOn ? "Mute microphone" : "Unmute microphone"}>
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </CtrlBtn>
        <CtrlBtn onClick={toggleWebcam} active={camOn} label={camOn ? "Turn camera off" : "Turn camera on"}>
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </CtrlBtn>
        <CtrlBtn
          onClick={() => toggleScreenShare()}
          active={localScreenShareOn}
          label={localScreenShareOn ? "Stop sharing" : "Share screen"}
        >
          {localScreenShareOn ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
        </CtrlBtn>
        <CtrlBtn onClick={() => onTogglePanel?.("participants")} active={panel === "participants"} label="Participants">
          <Users className="h-5 w-5" />
        </CtrlBtn>
        <CtrlBtn onClick={() => onTogglePanel?.("chat")} active={panel === "chat"} label="Chat">
          <MessageSquare className="h-5 w-5" />
        </CtrlBtn>
        <CtrlBtn onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} label="Full screen">
          <Maximize className="h-5 w-5" />
        </CtrlBtn>
        {canEndForEveryone && (
          <CtrlBtn onClick={() => setShowEndConfirm(true)} danger label="End for everyone">
            <PhoneOff className="h-5 w-5" />
          </CtrlBtn>
        )}
        {!canEndForEveryone && (
          <CtrlBtn onClick={() => { leave(); onLeave?.(); }} danger label="Leave call">
            <PhoneOff className="h-5 w-5" />
          </CtrlBtn>
        )}
      </div>

      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6">
            <h3 className="mb-2 text-lg font-semibold text-white">End for everyone?</h3>
            <p className="mb-5 text-sm text-white/60">This will close the session for all participants.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowEndConfirm(false)} className="rounded-full px-4 py-2 text-sm text-white/70 hover:bg-white/5">Cancel</button>
              <button
                onClick={() => { setShowEndConfirm(false); onEndForEveryone?.(); }}
                className="rounded-full bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500"
              >
                End session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
