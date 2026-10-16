import { Check } from "lucide-react";
import { cn } from "../../lib/utils.js";

// ---------------------------------------------------------------------------
// Step indicator. Rendered purely from `step` — never from local animation
// state — so it can never drift out of sync with the real checkout step.
// Completed steps are clickable (back-navigation) via `onSelect`.
// ---------------------------------------------------------------------------
const STEPS = [
  { id: 1, label: "Review order", short: "Review" },
  { id: 2, label: "Your details", short: "Details" },
  { id: 3, label: "Payment method", short: "Payment" },
  { id: 4, label: "Confirm & pay", short: "Confirm" },
];

export function StepIndicator({ step, onSelect, className }) {
  return (
    <nav aria-label="Checkout progress" className={cn("w-full", className)}>
      <ol className="flex items-start">
        {STEPS.map((s, i) => {
          const done = step > s.id;
          const active = step === s.id;
          const reachable = s.id < step && typeof onSelect === "function";

          return (
            <li key={s.id} className="relative flex min-w-0 flex-1 items-start">
              <button
                type="button"
                onClick={reachable ? () => onSelect(s.id) : undefined}
                disabled={!reachable}
                aria-current={active ? "step" : undefined}
                aria-label={`${s.label}${done ? " (completed)" : active ? " (current)" : ""}`}
                className={cn(
                  "group flex min-w-0 w-full flex-col items-center gap-2 rounded-lg px-1 py-1 text-center transition-colors",
                  reachable ? "cursor-pointer hover:bg-white/[0.04]" : "cursor-default",
                )}
              >
                <span className="relative flex w-full items-center justify-center">
                  {/* Connector lines sit behind the node so they never cross text. */}
                  {i > 0 && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute right-1/2 top-1/2 h-px w-full -translate-y-1/2",
                        done ? "bg-cyan-400/45" : "bg-white/10",
                      )}
                    />
                  )}
                  {i < STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-1/2 top-1/2 h-px w-full -translate-y-1/2",
                        done ? "bg-cyan-400/45" : "bg-white/10",
                      )}
                    />
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                      done && "border-cyan-400/60 bg-cyan-400/15 text-cyan-200",
                      active && "border-cyan-400 bg-cyan-400 text-black shadow-[0_0_18px_rgba(34,211,238,0.45)]",
                      !done && !active && "border-white/15 bg-[#0a0d16] text-white/40",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.id}
                  </span>
                </span>

                <span
                  className={cn(
                    "text-[11px] font-medium tracking-tight transition-colors sm:text-xs",
                    active ? "text-white" : done ? "text-white/60" : "text-white/35",
                  )}
                >
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
