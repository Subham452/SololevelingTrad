import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Radio, Users } from "lucide-react";
import { liveApi } from "../../lib/comms.js";
import { Container, SectionHeading, Reveal, Badge, Card } from "../ui.jsx";

// Community + live section: only REAL sessions from the backend. Never
// invents viewers, hosts or schedules — empty states when nothing is live.
export default function CommunityLive() {
  const [liveNow, setLiveNow] = useState(null);
  const [upcoming, setUpcoming] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      liveApi.list("live", {}).catch(() => null),
      liveApi.list("upcoming", {}).catch(() => null),
    ]).then(([l, u]) => {
      if (!alive) return;
      setLiveNow((l?.items || []).slice(0, 2));
      setUpcoming((u?.items || []).slice(0, 3));
    });
    return () => { alive = false; };
  }, []);

  return (
    <Container>
      <Reveal>
        <SectionHeading
          eyebrow="Community & live"
          title="Learn out loud, together"
          desc="Real broadcasts and rooms from the platform — join the conversation."
        />
      </Reveal>
      <div className="grid gap-4 md:grid-cols-2">
        <Reveal>
          <Card className="h-full bg-[#0D1220]/70">
            <div className="mb-3 flex items-center gap-2">
              <Radio className="h-4 w-4 text-red-400" aria-hidden />
              <h3 className="font-semibold text-white">Live now</h3>
            </div>
            {liveNow === null ? (
              <div className="h-16 animate-pulse rounded-xl bg-white/5" aria-label="Loading live sessions" />
            ) : liveNow.length === 0 ? (
              <p className="py-4 text-sm text-white/45">Nothing is broadcasting right now. Scheduled sessions appear under Upcoming.</p>
            ) : (
              <ul className="space-y-2">
                {liveNow.map((s) => (
                  <li key={s._id}>
                    <Link to={`/live/${s._id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3 transition hover:border-red-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                      <Badge tone="danger"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" aria-hidden /> Live</Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{s.title}</span>
                        <span className="block text-xs tabular-nums text-white/45">
                          <Users className="mr-1 inline h-3 w-3" aria-hidden />{s.viewerCount ?? 0} watching
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/live" className="mt-4 inline-block text-xs font-medium text-cyan-300 hover:underline">Browse all sessions →</Link>
          </Card>
        </Reveal>
        <Reveal delay={0.08}>
          <Card className="h-full bg-[#0D1220]/70">
            <h3 className="mb-3 font-semibold text-white">Upcoming</h3>
            {upcoming === null ? (
              <div className="h-16 animate-pulse rounded-xl bg-white/5" aria-label="Loading upcoming sessions" />
            ) : upcoming.length === 0 ? (
              <p className="py-4 text-sm text-white/45">No sessions scheduled yet. Hosts can schedule one from the studio.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((s) => (
                  <li key={s._id}>
                    <Link to={`/live/${s._id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3 transition hover:border-cyan-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
                      <Badge tone="accent">{s.category || "Session"}</Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{s.title}</span>
                        <span className="block text-xs text-white/45">
                          {s.scheduledStartAt ? new Date(s.scheduledStartAt).toLocaleString() : "Soon"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/community" className="mt-4 inline-block text-xs font-medium text-cyan-300 hover:underline">Explore the community →</Link>
          </Card>
        </Reveal>
      </div>
    </Container>
  );
}
