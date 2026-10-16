import { RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils.js";

const STYLES = {
  live: { dot: "bg-emerald-400", text: "text-emerald-300", label: "Live" },
  stale: { dot: "bg-amber-400", text: "text-amber-300", label: "Refreshing" },
  loading: { dot: "bg-white/40", text: "text-white/50", label: "Loading" },
  error: { dot: "bg-rose-400", text: "text-rose-300", label: "Offline" },
};

/**
 * Honest connection-state pill for market data panels.
 * `status`: loading | live | stale | error · optional retry + updatedAt.
 */
export default function StatusPill({ status = "loading", updatedAt, onRetry, className, compact = false }) {
  const s = STYLES[status] || STYLES.loading;
  return (
    <div className={cn("flex items-center gap-2 text-[11px]", className)}>
      <span className={cn("inline-flex items-center gap-1.5", s.text)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", s.dot, status === "live" && "animate-pulse")} />
        {s.label}
      </span>
      {updatedAt && !compact && (
        <span className="text-white/30">· {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      )}
      {status === "error" && onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-white/60 transition hover:text-white">
          <RefreshCw size={10} /> Retry
        </button>
      )}
    </div>
  );
}
