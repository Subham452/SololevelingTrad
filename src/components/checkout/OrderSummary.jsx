import { Fragment } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { fmtCents, intervalText } from "../../lib/checkout.js";
import { cn } from "../../lib/utils.js";

// ---------------------------------------------------------------------------
// Order breakdown. Renders integer cents straight from the server payload —
// no arithmetic happens here beyond formatting.
// ---------------------------------------------------------------------------
function Line({ label, value, tone = "muted", strong, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className={cn("text-sm", strong ? "font-semibold text-white" : "text-white/55")}>
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-white/35">{hint}</span>}
      </span>
      <span
        className={cn(
          "num shrink-0 tabular-nums",
          strong ? "text-lg font-bold text-white" : "text-sm",
          tone === "muted" && "text-white/70",
          tone === "accent" && "text-emerald-300",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function OrderSummary({ value, className, showTerms = true }) {
  const reduce = useReducedMotion();
  if (!value) return null;

  const currency = value.currency || "USD";
  const isCrypto = value.type === "crypto" || !!value.asset;
  const qty = Number(value.quantity ?? 0);
  const showFee = Number(value.feeCents || 0) > 0;
  const showTax = Number(value.taxCents || 0) > 0;
  const showDiscount = Number(value.discountCents || 0) > 0;

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5", className)}>
      {/* ---- What is being bought ---- */}
      <div className="flex items-start gap-3 border-b border-white/10 pb-4">
        <div
          aria-hidden
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[11px] font-bold uppercase",
            isCrypto
              ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
              : "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
          )}
        >
          {isCrypto ? (value.asset?.symbol || "—") : "PRO"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {isCrypto
              ? `${value.asset?.name || value.asset?.symbol || "Asset"} purchase`
              : value.planName || value.planSlug || "Subscription"}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            {isCrypto ? (
              <>
                <span className="num">{qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>{" "}
                {value.asset?.symbol} @{" "}
                <span className="num">{fmtCents(value.unitPriceCents, currency)}</span>
              </>
            ) : (
              `Renews ${intervalText(value.interval, value.intervalCount)}`
            )}
          </p>
          {isCrypto && value.quoteExpiresAt && (
            <p className="mt-1 text-[11px] text-white/35">
              Quote source: {value.quoteSource || "market feed"} · valid until{" "}
              <span className="num">
                {new Date(value.quoteExpiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* ---- Money breakdown ---- */}
      <div className="divide-y divide-white/[0.06] pt-2">
        <Line
          label={isCrypto ? "Subtotal" : "Plan price"}
          hint={isCrypto ? `(${qty} × ${fmtCents(value.unitPriceCents, currency)})` : undefined}
          value={fmtCents(value.subtotalCents, currency)}
        />
        {showFee && <Line label="Platform fee" hint={`${((Number(value.feeCents) / Math.max(1, Number(value.subtotalCents))) * 100).toFixed(2)}%`} value={fmtCents(value.feeCents, currency)} />}
        {showTax && <Line label="Tax" value={fmtCents(value.taxCents, currency)} />}
        {showDiscount && <Line label="Discount" tone="accent" value={`−${fmtCents(value.discountCents, currency)}`} />}
      </div>

      {/* ---- Total (animated only when it actually changes) ---- */}
      <div className="mt-3 border-t border-white/15 pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-semibold text-white">Total due today</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={value.totalCents}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="num text-2xl font-bold tracking-tight text-white"
            >
              {fmtCents(value.totalCents, currency)}
            </motion.span>
          </AnimatePresence>
        </div>
        <p className="mt-1 text-[11px] text-white/35">
          {currency} · amount charged by the server at payment time
        </p>
      </div>

      {/* ---- Terms / renewal disclosure ---- */}
      {showTerms && (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          {!isCrypto && (
            <Fragment>
              <p className="text-[11px] leading-relaxed text-white/50">
                <span className="font-medium text-white/70">Renewal:</span> billed{" "}
                {intervalText(value.interval, value.intervalCount)} at{" "}
                <span className="num">{fmtCents(value.totalCents, currency)}</span> until you cancel.
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/50">
                <span className="font-medium text-white/70">Cancellation:</span> cancel anytime from
                Subscription &amp; Billing — access continues until the end of the paid period. No
                partial-period refunds.
              </p>
            </Fragment>
          )}
          {isCrypto && (
            <p className="text-[11px] leading-relaxed text-white/50">
              {value.terms?.note || value.settlement?.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function SecureNote({ className }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[11px] leading-relaxed text-white/40", className)}>
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" aria-hidden />
      <span>
        Encrypted checkout. Card and UPI details are collected by our payment provider in their own
        secure window — they are never sent to or stored on our servers.
      </span>
    </p>
  );
}
