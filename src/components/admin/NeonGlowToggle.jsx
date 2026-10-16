import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils.js";
import { toggleGlow, useAdminGlow } from "../../lib/glow.js";

/**
 * Global "Neon Glow" switch for the Admin Control Center.
 *
 * A real switch (`role="switch"` + `aria-checked`) that flips the admin
 * shell's decorative illumination. The preference is persisted by lib/glow.js
 * and applied by AdminLayout via the `data-glow` attribute, so this control
 * genuinely governs every glow effect instead of just restyling itself.
 *
 * Keyboard: it is a native <button>, so Enter/Space toggle it and it is
 * reachable by Tab. State changes are announced via the changing accessible
 * name plus the transient live region below.
 */
export default function NeonGlowToggle({ className }) {
  const on = useAdminGlow();
  const reduce = useReducedMotion();
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const onClick = () => {
    const next = !on;
    toggleGlow();
    setFlash(next ? "Neon glow enabled" : "Neon glow disabled");
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Neon glow effects"
        onClick={onClick}
        className={cn(
          "glow-toggle inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
          on
            ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
            : "border-white/12 bg-white/[0.03] text-white/55 hover:text-white/80",
        )}
      >
        <Sparkles
          className={cn("h-3.5 w-3.5 shrink-0", on ? "glow-icon text-cyan-300" : "text-white/40")}
          aria-hidden
        />
        <span className="hidden whitespace-nowrap sm:inline">
          Neon Glow: <span className="font-semibold">{on ? "ON" : "OFF"}</span>
        </span>
        <span className="sr-only sm:hidden">Neon Glow: {on ? "ON" : "OFF"}</span>

        {/* Track + knob — a decorative representation of aria-checked. */}
        <span
          aria-hidden
          className={cn(
            "relative ml-0.5 h-4 w-7 shrink-0 rounded-full border transition",
            on ? "border-cyan-400/50 bg-cyan-400/25" : "border-white/15 bg-white/10",
          )}
        >
          <motion.span
            style={{ y: "-50%" }}
            animate={{ x: on ? 12 : 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 32 }}
            className={cn(
              "absolute left-0.5 top-1/2 h-3 w-3 rounded-full",
              on ? "glow-knob bg-cyan-300" : "bg-white/60",
            )}
          />
        </span>
      </button>

      {/* Subtle confirmation of the state change. */}
      <AnimatePresence>
        {flash && (
          <motion.span
            key={flash}
            role="status"
            aria-live="polite"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/12 bg-[#0b0f1a] px-2.5 py-1 text-[10px] text-white/70 shadow-xl"
          >
            {flash}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
