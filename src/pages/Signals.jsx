import { useState } from "react";
import { SectionHeading, Reveal, LoadingState, EmptyState, Badge } from "../components/ui.jsx";
import { SignalCard } from "../components/Cards.jsx";
import { signals } from "../data/mockData.js";
import { cn } from "../lib/utils.js";

/**
 * Signals — PREVIEW. The analysis cards below are demo content used to
 * showcase the signal format; they are clearly labelled and are not live
 * trading advice or real positions.
 */
export default function Signals() {
  const [mode, setMode] = useState("list");
  const [watched, setWatched] = useState([]);
  const toggle = (id) => setWatched((w) => w.includes(id) ? w.filter((x) => x !== id) : [...w, id]);
  return (
    <div>
      <SectionHeading
        eyebrow="SIGNALS · PREVIEW" title="Ranked setups, honest confidence"
        copy="Demo analysis used to preview the signal format — not live advice or real positions. Demo state switcher included for QA."
      />
      <div className="mb-6 flex flex-wrap justify-center gap-2 text-xs">
        {[["list", "Demo feed"], ["loading", "Loading"], ["empty", "Empty"], ["error", "Error"]].map(([m, l]) => (
          <button
            key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
            className={cn("rounded-full border px-4 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60", mode === m ? "border-cyan-500/50 bg-cyan-500/10 text-white" : "border-white/15 text-white/50 hover:text-white")}
          >
            {l}
          </button>
        ))}
      </div>
      {mode === "list" && <div className="mb-4 flex justify-center"><Badge tone="warning">Demo data — for illustration only</Badge></div>}
      {mode === "loading" && <LoadingState label="Scanning markets…" />}
      {mode === "empty" && <EmptyState title="No signals right now" copy="The scanner is quiet. Alerts will fire when structure confirms." />}
      {mode === "error" && <EmptyState title="Signal feed unavailable" copy="Retry in a moment — your watchlist is safe." action={<button type="button" onClick={() => setMode("list")} className="rounded-full bg-white px-5 py-2 text-sm text-black">Retry</button>} />}
      {mode === "list" && <div className="grid gap-4 md:grid-cols-2">{signals.map((s) => <Reveal key={s.id}><SignalCard signal={s} watched={watched.includes(s.id)} onWatch={toggle} /></Reveal>)}</div>}
    </div>
  );
}
