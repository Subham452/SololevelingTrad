import { useId } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils.js";

/**
 * SLT brand system — an original compact monogram (chart-line "S" in a
 * rounded tile) plus a premium SololevelingTrad wordmark.
 * Gradient IDs are per-instance (useId) so multiple marks can coexist.
 */

export function BrandMark({ size = 28, className }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <defs>
        <linearGradient id={`m-${id}`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="#070b14" stroke={`url(#m-${id})`} strokeWidth="1.6" />
      <path d="M21.6 10.2H14.1a3.1 3.1 0 0 0 0 6.2h4.3a3.1 3.1 0 0 1 0 6.2H10.4" stroke={`url(#m-${id})`} strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="23.4" cy="22.6" r="1.7" fill="#22d3ee" />
      <path d="M23.4 15.4v3.4" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}

export function BrandWordmark({ className, size = "text-[15px]" }) {
  return (
    <span className={cn("inline-flex select-none items-baseline font-display font-extrabold tracking-tight text-white", size, className)}>
      Sololeveling<GradientTail />
    </span>
  );
}

function GradientTail() {
  const id = useId().replace(/:/g, "");
  return (
    <>
      <svg width="0" height="0" aria-hidden className="absolute">
        <defs>
          <linearGradient id={`w-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#22d3ee" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <span style={{ background: `linear-gradient(135deg, #22d3ee, #8b5cf6)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
        Trad
      </span>
    </>
  );
}

/** Full lockup: mark + wordmark, linked to the landing page. */
export function Brand({ collapsed = false, to = "/", className }) {
  return (
    <Link to={to} className={cn("group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60", className)} aria-label="SololevelingTrad — home">
      <BrandMark size={30} className="shrink-0 transition-transform duration-200 group-hover:scale-[1.04]" />
      {!collapsed && <BrandWordmark />}
    </Link>
  );
}

export default Brand;
