import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils.js";

const btnVariants = {
  primary: "bg-white text-black hover:bg-white/90",
  secondary: "border border-white/15 bg-white/5 text-white hover:bg-white/10",
  ghost: "text-white/70 hover:text-white hover:bg-white/5",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
  accent: "bg-gradient-to-r from-cyan-400 to-violet-500 text-black font-semibold hover:opacity-90",
};
const btnSizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-50 disabled:pointer-events-none";

/**
 * Link-aware button: pass `to` (router link) or `href` (external) and the
 * button renders as an anchor with identical styling. Plain click handlers
 * keep working as before.
 */
export function Button({ variant = "primary", size = "md", loading, disabled, className, children, to, href, ...props }) {
  // Glow class is a no-op outside the admin shell (all glow CSS is scoped to
  // `.admin-shell[data-glow="on"]`), so the dashboard is untouched.
  const glowCls = variant === "secondary" ? "glow-btn-sec" : `glow-btn-${variant}`;
  const cls = cn(btnBase, btnVariants[variant], btnSizes[size], glowCls, className);
  const inner = (
    <>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </>
  );
  if (to && !disabled && !loading) {
    return <Link to={to} className={cls} {...props}>{inner}</Link>;
  }
  if (href && !disabled && !loading) {
    return <a href={href} className={cls} {...props}>{inner}</a>;
  }
  return (
    <button disabled={disabled || loading} className={cls} {...props}>
      {inner}
    </button>
  );
}

export function IconButton({ className, label, ...props }) {
  return (
    <button
      aria-label={label}
      className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60", className)}
      {...props}
    />
  );
}

const badgeTones = {
  default: "border-white/10 bg-white/5 text-white/70",
  accent: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

export function Badge({ tone = "default", className, children }) {
  return (
    <span className={cn("glow-badge inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", badgeTones[tone], badgeTones[tone] && `glow-badge-${tone}`, className)}>
      {children}
    </span>
  );
}

export function Card({ selected, disabled, loading, error, className, children, ...props }) {
  return (
    <div
      className={cn(
        "glow-card rounded-xl border border-white/10 bg-transparent p-5 transition-all hover:-translate-y-0.5 hover:border-white/20",
        selected && "border-cyan-500/50",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      {...props}
    >
      {loading ? <div className="space-y-2 animate-pulse"><div className="h-4 rounded bg-white/10" /><div className="h-4 w-2/3 rounded bg-white/10" /></div>
      : error ? <p className="text-sm text-rose-400">{error}</p> : children}
    </div>
  );
}

export function GlassPanel({ className, children, ...props }) {
  return (
    <div className={cn("glow-card rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-xl", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Standard dashboard panel: bordered surface with an optional header row
 * (title + description on the left, actions on the right).
 */
export function Panel({ title, desc, actions, className, bodyClassName, children, ...props }) {
  return (
    <section className={cn("glow-card flex flex-col rounded-2xl border border-white/10 bg-white/[0.02]", className)} {...props}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h3 className="glow-section truncate text-sm font-semibold text-white">{title}</h3>}
            {desc && <p className="mt-0.5 text-xs text-white/45">{desc}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("flex-1 p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Container({ className, children }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Section({ className, children, ...props }) {
  return <section className={cn("py-[var(--space-section,5rem)]", className)} {...props}>{children}</section>;
}

export function SectionHeading({ eyebrow, title, desc, copy, className }) {
  const sub = desc || copy;
  return (
    <div className={cn("mb-10 max-w-2xl", className)}>
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">{eyebrow}</p>}
      {title && <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>}
      {sub && <p className="mt-3 text-sm text-white/60">{sub}</p>}
    </div>
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn("glow-input w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60", className)}
      {...props}
    />
  );
}

export function FormField({ label, error, className, children }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      {label && <span className="text-xs font-medium text-white/60">{label}</span>}
      {children}
      {error && <span className="block text-xs text-rose-400">{error}</span>}
    </label>
  );
}

export function EmptyState({ title = "Nothing here yet", desc, copy, action, className }) {
  const sub = desc || copy;
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-white/10 py-12 px-4 text-center", className)}>
      <p className="text-sm font-medium text-white">{title}</p>
      {sub && <p className="max-w-sm text-xs text-white/50">{sub}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label, rows = 3, className }) {
  return (
    <div className={cn("space-y-3 animate-pulse", className)} role="status" aria-label={label || "Loading"}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl border border-white/10 bg-white/5" />
      ))}
    </div>
  );
}

/**
 * Segmented control — a compact tab strip for switching modes/ranges.
 * items: [{ value, label }]  ·  onChange(value)
 */
export function Segmented({ items, value, onChange, size = "md", className, ariaLabel }) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1 text-xs";
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-0.5 no-scrollbar", className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value} role="tab" aria-selected={active} type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "relative whitespace-nowrap rounded-full font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
              pad,
              active ? "text-black" : "text-white/60 hover:text-white"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${ariaLabel || "seg"}`} transition={{ duration: 0.18, ease: "easeOut" }}
                className="absolute inset-0 rounded-full bg-white"
              />
            )}
            <span className="relative z-10">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Lightweight hover/focus tooltip wrapper (no portal). Place `tip` text
 * next to the trigger; shows above it by default.
 */
export function Tooltip({ tip, children, side = "top", className }) {
  const pos = side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5";
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#0b0f1a] px-2.5 py-1.5 text-[11px] text-white/80 opacity-0 shadow-xl transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          pos
        )}
      >
        {tip}
      </span>
    </span>
  );
}

/** Positive/negative coloured percentage or price delta. */
export function Delta({ value, className, suffix = "%" }) {
  if (value == null || Number.isNaN(Number(value))) return <span className={cn("num text-white/40", className)}>—</span>;
  const up = Number(value) >= 0;
  return (
    <span className={cn("num", up ? "text-emerald-400" : "text-rose-400", className)}>
      {up ? "+" : ""}{Number(value).toFixed(2)}{suffix}
    </span>
  );
}

export function Reveal({ children, className, delay = 0 }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay }}
    >
      {children}
    </motion.div>
  );
}
