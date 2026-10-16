import { useState } from "react";
import { resolveMedia } from "../../lib/community.js";
import { cn } from "../../lib/utils.js";

// Deterministic accent from a string (name/id) so avatars are stable.
const accents = [
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-fuchsia-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-600",
];
function accentFor(seed = "") {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return accents[h % accents.length];
}
function initialsOf(name = "", username = "") {
  const n = (name || username || "?").trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase() || "?";
}

export function Avatar({ src, name = "", username = "", id = "", size = "md", className, ring }) {
  const [failed, setFailed] = useState(false);
  const url = resolveMedia(src);
  const sizes = { xs: "h-7 w-7 text-[10px]", sm: "h-9 w-9 text-xs", md: "h-11 w-11 text-sm", lg: "h-16 w-16 text-lg", xl: "h-24 w-24 text-2xl" };
  const label = initialsOf(name, username);
  const seed = id || username || name;
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-full", sizes[size], ring && "ring-2 ring-white/15", className)}>
      {url && !failed ? (
        <img src={url} alt={name || username} onError={() => setFailed(true)} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className={cn("flex h-full w-full items-center justify-center font-bold text-white bg-gradient-to-br", accentFor(seed))}>{label}</div>
      )}
    </div>
  );
}
