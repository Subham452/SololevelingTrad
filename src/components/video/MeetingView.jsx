import { useEffect, useMemo, useRef, useState } from "react";
import { X, Send } from "lucide-react";
import { useMeeting, usePubSub } from "@videosdk.live/react-sdk";
import ParticipantTile from "./ParticipantTile.jsx";
import MeetingControls from "./MeetingControls.jsx";
import { Avatar } from "../community/Avatar.jsx";

// Side panel: participants list or live chat (via SDK PubSub).
function Panel({ mode, onClose, participants, messages, onSend }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, participants]);

  return (
    <aside className="flex h-full w-80 flex-col border-l border-white/10 bg-neutral-900/80 backdrop-blur">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{mode === "participants" ? `Participants (${participants.length})` : "In-call chat"}</h3>
        <button onClick={onClose} aria-label="Close panel" className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </header>

      {mode === "participants" ? (
        <div className="flex-1 overflow-y-auto p-2">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
              <Avatar name={p.displayName} size="sm" id={p.id} />
              <span className="truncate text-sm text-white/85">{p.displayName}{p.isLocal ? " (You)" : ""}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={m.senderId + i} className="text-sm">
                <span className="mr-1.5 font-semibold text-cyan-300">{m.senderName || "Guest"}</span>
                <span className="text-white/85">{m.message}</span>
              </div>
            ))}
            {!messages.length && <p className="pt-8 text-center text-xs text-white/40">No messages yet</p>}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onSend(text.trim()); setText(""); } }}
            className="flex items-center gap-2 border-t border-white/10 p-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message everyone…"
              className="flex-1 rounded-full bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
            <button type="submit" aria-label="Send" className="rounded-full bg-cyan-500 p-2 text-black hover:bg-cyan-400"><Send className="h-4 w-4" /></button>
          </form>
        </>
      )}
    </aside>
  );
}

// The active-meeting layout. Must be rendered inside <MeetingProvider>.
export default function MeetingView({ canEndForEveryone, onEndForEveryone, onLeave }) {
  const { localParticipant, participants } = useMeeting();
  const { messages, publish } = usePubSub("CHAT");
  const [panel, setPanel] = useState(null);
  const [pinned, setPinned] = useState(null);
  // NOTE: no manual join() here — MeetingProvider already joins automatically
  // via joinWithoutUserInteraction. Calling join() again caused a double-join
  // ("already in the meeting") error from the SDK.

  const participantList = useMemo(() => {
    const arr = [{ id: localParticipant?.id, displayName: localParticipant?.displayName, isLocal: true }, ...Array.from(participants.keys()).map((id) => ({ id }))];
    return arr.filter((p) => p.id);
  }, [participants, localParticipant]);

  const pinnedId = pinned || participantList[0]?.id;
  const gridIds = participantList.map((p) => p.id);

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 gap-3 p-3">
          {/* pinned / large view */}
          <div className="min-w-0 flex-[2]">{pinnedId && <ParticipantTile participantId={pinnedId} isLarge />}</div>
          {/* filmstrip */}
          <div className="hidden w-40 flex-col gap-2 overflow-y-auto md:flex">
            {gridIds.filter((id) => id !== pinnedId).map((id) => (
              <ParticipantTile key={id} participantId={id} onPin={() => setPinned(id)} />
            ))}
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-4">
          <MeetingControls
            panel={panel}
            onTogglePanel={(m) => setPanel((p) => (p === m ? null : m))}
            onLeave={onLeave}
            canEndForEveryone={canEndForEveryone}
            onEndForEveryone={onEndForEveryone}
          />
        </div>
      </div>

      {panel && (
        <Panel
          mode={panel}
          onClose={() => setPanel(null)}
          participants={participantList}
          messages={messages}
          onSend={(message) => publish(message, { persist: false })}
        />
      )}
    </div>
  );
}
