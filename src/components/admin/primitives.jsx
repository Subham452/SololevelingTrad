// Shared building blocks for the Admin Control Center. Extends the existing
// ui.jsx kit (same tokens) rather than installing a duplicate component
// library — the project is JS + Tailwind v4 with a bespoke theme.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle, Loader2, Search, X } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { Button, Badge, Input, EmptyState, LoadingState } from "../ui.jsx";
import { fmtNum, RANGE_PRESETS, rangeForPreset } from "./format.js";

const STATUS_TONES = {
  paid: "success", active: "success", success: "success", healthy: "success", resolved: "success",
  live: "success", accepted: "success", ended: "default", closed: "default", dismissed: "default",
  created: "accent", ringing: "accent", reviewing: "warning", past_due: "warning",
  pending: "warning", scheduled: "warning", failed: "danger", banned: "danger",
  suspended: "danger", refunded: "violet", inactive: "default", cancelled: "default",
  expired: "default", missed: "danger", rejected: "danger",
};

/** Status pill mapped to the shared Badge tones. */
export function StatusPill({ status, className }) {
  if (!status) return <span className="text-white/40">—</span>;
  const tone = STATUS_TONES[status] || "default";
  return <Badge tone={tone} className={cn("capitalize", className)}>{String(status).replace(/_/g, " ")}</Badge>;
}

// ---------------------------------------------------------------------------
// QueryState — consistent loading / error / empty handling for every table.
// ---------------------------------------------------------------------------
export function QueryState({ loading, error, empty, onRetry, rows = 4, emptyTitle = "Nothing here", emptyDesc }) {
  if (loading) return <LoadingState rows={rows} label="Loading…" />;
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 px-4 py-10 text-center" role="alert">
        <AlertTriangle className="glow-icon-rose h-5 w-5 text-rose-400" />
        <div>
          <p className="text-sm font-medium text-white">Couldn’t load this data</p>
          <p className="mt-1 max-w-md text-xs text-white/50">{error}</p>
        </div>
        {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
      </div>
    );
  }
  if (empty) return <EmptyState title={emptyTitle} desc={emptyDesc} />;
  return null;
}

// ---------------------------------------------------------------------------
// DataTable — semantic table with sticky header, sortable columns, row click.
// columns: [{ key, header, className, sortable?, render(row) }]
// ---------------------------------------------------------------------------
export function DataTable({ columns, rows, sort, dir, onSort, onRowClick, rowKey = "_id", className }) {
  return (
    <div className={cn("overflow-x-auto thin-scroll", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[#0a0e17]">
          <tr className="border-b border-white/10">
            {columns.map((col) => {
              const active = sort === col.key;
              const sortable = col.sortable !== false && onSort;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn("whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/45", col.className)}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className={cn("inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 rounded", active && "text-cyan-300")}
                    >
                      {col.header}
                      <ChevronRight className={cn("h-3 w-3 transition-transform", active && dir === "asc" ? "-rotate-90" : "rotate-90", active ? "glow-icon opacity-100" : "opacity-30")} />
                    </button>
                  ) : col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[rowKey] ?? JSON.stringify(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-white/[0.06] transition-colors",
                onRowClick && "cursor-pointer hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none",
              )}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(row); } : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("px-3 py-2.5 align-middle text-white/75", col.cellClassName)}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination — server-driven page controls with accessible labels.
// ---------------------------------------------------------------------------
export function Pagination({ page, pages, total, onPage, limit, onLimit, loading }) {
  const safePage = page || 1;
  const safePages = Math.max(1, pages || 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-3 py-3 text-xs text-white/50">
      <span aria-live="polite">
        {fmtNum(total)} result{total === 1 ? "" : "s"} · page {safePage} of {safePages}
      </span>
      <div className="flex items-center gap-2">
        {onLimit && (
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Rows per page</span>
            <select
              value={limit || 20}
              onChange={(e) => onLimit(Number(e.target.value))}
              disabled={loading}
              className="glow-input rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </label>
        )}
        <button
          type="button" onClick={() => onPage(safePage - 1)} disabled={loading || safePage <= 1}
          aria-label="Previous page"
          className="glow-btn-sec inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button" onClick={() => onPage(safePage + 1)} disabled={loading || safePage >= safePages}
          aria-label="Next page"
          className="glow-btn-sec inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfirmDialog — destructive actions require explicit confirmation; optional
// reason textarea is surfaced for moderation/refund flows.
// ---------------------------------------------------------------------------
export function ConfirmDialog({
  open, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel",
  tone = "danger", loading, reason, reasonLabel = "Reason", reasonPlaceholder = "Optional — recorded in the audit log",
  requireReason = false, onReasonChange, onConfirm, onCancel, children,
}) {
  const cancelRef = useRef(null);
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => cancelRef.current?.focus(), 30);
      const onKey = (e) => { if (e.key === "Escape" && !loading) onCancel?.(); };
      window.addEventListener("keydown", onKey);
      return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
    }
    return undefined;
  }, [open, loading, onCancel]);

  if (!open) return null;
  const blocked = requireReason && !String(reason || "").trim();
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !loading && onCancel?.()} />
      <div className="glow-card relative w-full max-w-md rounded-2xl border border-white/12 bg-[#0b0f1a] p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="mt-2 text-sm text-white/60">{description}</p>}
        {children}
        {onReasonChange !== undefined && (
          <label className="mt-4 block">
            <span className="text-xs font-medium text-white/60">{reasonLabel}{requireReason ? " (required)" : ""}</span>
            <textarea
              value={reason || ""} onChange={(e) => onReasonChange(e.target.value)}
              rows={3} placeholder={reasonPlaceholder} disabled={loading}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} variant="ghost" size="sm" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"} size="sm"
            onClick={onConfirm} disabled={loading || blocked}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DateRangePresets — executive dashboard date presets + custom range.
// onChange({ from, to, label })
// ---------------------------------------------------------------------------
export function DateRangePresets({ value, onChange, className }) {
  const [custom, setCustom] = useState(false);
  const items = useMemo(() => RANGE_PRESETS.map((p) => ({ ...p, ...rangeForPreset(p.days) })), []);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} role="group" aria-label="Date range">
      {items.map((p) => {
        const active = !custom && value?.from === p.from && value?.to === p.to;
        return (
          <button
            key={p.label} type="button"
            onClick={() => { setCustom(false); onChange({ from: p.from, to: p.to, label: p.label }); }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
              active ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:border-white/25",
            )}
            aria-pressed={active}
          >
            {p.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setCustom((c) => !c)}
        className={cn(
          "rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
          custom ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white",
        )}
        aria-expanded={custom}
      >
        Custom
      </button>
      {custom && (
        <span className="flex items-center gap-2">
          <input
            type="date" aria-label="From date" value={value?.from || ""} max={value?.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value, label: "Custom" })}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          />
          <span className="text-white/30">→</span>
          <input
            type="date" aria-label="To date" value={value?.to || ""} min={value?.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value, label: "Custom" })}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          />
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar — search + filter controls row used across list pages.
// ---------------------------------------------------------------------------
export function SearchInput({ value, onChange, placeholder = "Search…", className, ariaLabel }) {
  const [local, setLocal] = useState(value || "");
  useEffect(() => setLocal(value || ""), [value]);
  useEffect(() => {
    const t = setTimeout(() => { if (local !== (value || "")) onChange(local); }, 350);
    return () => clearTimeout(t);
  }, [local, value, onChange]);
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
      <Input
        type="search" value={local} onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder} aria-label={ariaLabel || placeholder}
        className="pl-9 pr-8"
      />
      {local && (
        <button
          type="button" onClick={() => { setLocal(""); onChange(""); }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function SelectFilter({ label, value, onChange, options, className }) {
  return (
    <label className={cn("flex items-center gap-2", className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="glow-input rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        <option value="">{label}: all</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// StatCard — KPI tile with tooltip + optional delta (period comparison).
// ---------------------------------------------------------------------------
export function StatCard({ label, value, sub, delta, tip, icon: Icon, tone = "cyan", loading }) {
  const toneMap = {
    cyan: "text-cyan-300", green: "text-emerald-300", violet: "text-violet-300",
    amber: "text-amber-300", rose: "text-rose-300", white: "text-white/70",
  };
  const deltaNeg = typeof delta === "number" ? delta < 0 : String(delta || "").startsWith("-");
  return (
    <div className="glow-card group relative rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/20">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/45">{label}</p>
        {Icon && <Icon className={cn("glow-icon h-4 w-4 shrink-0", toneMap[tone])} aria-hidden />}
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-24 animate-pulse rounded bg-white/10" />
      ) : (
        <p className="glow-value num mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      )}
      {(sub || delta != null) && (
        <p className="mt-1.5 text-xs">
          {delta != null && (
            <span className={cn("num font-medium", deltaNeg ? "text-rose-400" : "text-emerald-400")}>
              {delta > 0 ? "+" : ""}{Number(delta).toFixed(1)}%
            </span>
          )}
          {sub && <span className="ml-1.5 text-white/40">{sub}</span>}
        </p>
      )}
      {tip && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-[#0b0f1a] px-2.5 py-1.5 text-[11px] leading-relaxed text-white/70 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {tip}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageHeader — title + description + right-side actions for every admin page.
// ---------------------------------------------------------------------------
export function PageHeader({ title, desc, actions, badge }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="glow-title font-display text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h1>
          {badge}
        </div>
        {desc && <p className="mt-1 max-w-2xl text-sm text-white/50">{desc}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Inline refresh button with spinner state. */
export function RefreshButton({ onClick, loading, label = "Refresh" }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={loading}>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {label}
    </Button>
  );
}
