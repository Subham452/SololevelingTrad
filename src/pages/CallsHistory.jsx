import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneMissed, Phone, Video, AudioLines, PhoneCall } from "lucide-react";
import { callApi } from "../lib/comms.js";
import { Avatar } from "../components/community/Avatar.jsx";
import NewCallDialog from "../components/calls/NewCallDialog.jsx";
import { Container, SectionHeading, Button, Badge, EmptyState } from "../components/ui.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";
import { cn } from "../lib/utils.js";

function dirIcon(c) {
  // Direction is only reliable from status here; we don't fabricate it.
  if (["missed", "rejected", "cancelled"].includes(c.status)) return { icon: PhoneMissed, cls: "text-red-400" };
  return { icon: Phone, cls: "text-cyan-400" };
}

const fmtDur = (s) => {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export default function CallsHistory() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showNewCall, setShowNewCall] = useState(false);

  useEffect(() => {
    callApi.history(50).then((d) => setItems(d?.items || [])).catch((e) => setErr(e?.message || "Failed to load")).finally(() => setLoading(false));
  }, []);

  return (
    <Container className="py-8">
      <div className="flex items-start justify-between gap-4">
        <SectionHeading eyebrow="Calls" title="Call history" desc="Your recent audio and video calls." />
        <Button className="mt-10 shrink-0" onClick={() => setShowNewCall(true)}><PhoneCall className="h-4 w-4" /> New call</Button>
      </div>
      <div className="mt-6">
        {loading ? <SkeletonLoader rows={4} />
          : err ? <EmptyState title="Couldn't load calls" desc={err} action={<Button size="sm" onClick={() => location.reload()}>Retry</Button>} />
          : items.length === 0 ? <EmptyState title="No calls yet" desc="Calls you make from a chat will show up here." action={<Button size="sm" onClick={() => nav("/community")}>Open chat</Button>} />
          : (
            <div className="divide-y divide-white/5 rounded-2xl border border-white/10">
              {items.map((c) => {
                const { icon: DirIcon, cls } = dirIcon(c);
                const TypeIcon = c.type === "video" ? Video : AudioLines;
                return (
                  <div key={c._id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={c.counterpart?.firstName || c.counterpart?.username || "Caller"} size="md" id={c.counterpart?._id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{c.counterpart?.firstName || c.counterpart?.username || "Unknown"}</p>
                      <p className="flex items-center gap-1.5 text-xs text-white/40">
                        <DirIcon className={cn("h-3.5 w-3.5", cls)} />
                        <TypeIcon className="h-3.5 w-3.5" />
                        {new Date(c.createdAt).toLocaleString()} {fmtDur(c.durationSeconds) && `· ${fmtDur(c.durationSeconds)}`}
                      </p>
                    </div>
                    <Badge tone={c.status === "ended" ? "success" : ["missed", "rejected"].includes(c.status) ? "danger" : "default"}>{c.status}</Badge>
                  </div>
                );
              })}
            </div>
          )}
      </div>
      {showNewCall && <NewCallDialog onClose={() => setShowNewCall(false)} />}
    </Container>
  );
}
