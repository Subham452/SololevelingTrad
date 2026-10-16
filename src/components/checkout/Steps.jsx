import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowRight, ArrowLeft, RefreshCw, Lock, CreditCard, Sparkles, Mail,
  AlertTriangle, CheckCircle2, Info,
} from "lucide-react";
import { Button, Badge, FormField, Input } from "../ui.jsx";
import { OrderSummary, SecureNote } from "./OrderSummary.jsx";
import { fmtCents, intervalText } from "../../lib/checkout.js";
import { cn } from "../../lib/utils.js";

// Shared animation for switching between steps. Skipped under reduced-motion.
export function StepPane({ paneKey, dir = 1, reduce, children }) {
  if (reduce) return <div>{children}</div>;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={paneKey}
        initial={{ opacity: 0, x: 18 * dir }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -18 * dir }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// STEP 1 — Review the order
// ---------------------------------------------------------------------------
export function ReviewStep({ quote, pricing, isCrypto, quantity, onQuantityChange, onRefresh, refreshing, quoteError, expiresAt, onBack, onContinue, busy }) {
  const reduce = useReducedMotion();

  // Live quote-expiry countdown. `now` only advances inside the interval
  // callback, and `secs` is derived from it — nothing is set during render or
  // synchronously inside an effect.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const secs = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000))
    : null;

  // Auto-refresh ONCE per quote when it lapses (never once per second), so an
  // abandoned tab can't hammer the pricing endpoint.
  const refreshedRef = useRef(false);
  useEffect(() => { if (!expiresAt) refreshedRef.current = false; }, [expiresAt]);
  useEffect(() => {
    if (secs === 0 && !refreshedRef.current) { refreshedRef.current = true; onRefresh?.(); }
  }, [secs, expiresAt, onRefresh]);

  if (!pricing) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    );
  }

  const expired = secs === 0;

  return (
    <div className="space-y-4">
      {isCrypto && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <FormField label="Quantity" className="w-40">
              <Input
                type="number"
                inputMode="decimal"
                min={pricing.minQty ?? 0}
                step="any"
                value={quantity}
                onChange={(e) => onQuantityChange?.(e.target.value)}
                aria-label="Quantity to purchase"
              />
            </FormField>
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-widest text-white/40">Live unit price</p>
              <p className="num mt-1 text-lg font-semibold text-white">
                {fmtCents(pricing.unitPriceCents, pricing.currency)}
                <span className="ml-2 text-xs font-normal text-white/40">{pricing.quoteSource}</span>
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} aria-label="Refresh quote">
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
              {refreshing ? "Refreshing" : "Refresh"}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            {expired ? (
              <Badge tone="danger"><AlertTriangle className="mr-1 h-3 w-3" aria-hidden /> Quote expired — refresh to continue</Badge>
            ) : secs !== null ? (
              <Badge tone="warning">Quote locks this price for {secs}s</Badge>
            ) : null}
            <span className="text-white/35">
              Quote issued {pricing.quoteIssuedAt ? new Date(pricing.quoteIssuedAt).toLocaleTimeString() : "just now"}
            </span>
          </div>
        </div>
      )}

      {quoteError && (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          {quoteError}
        </p>
      )}

      <OrderSummary value={pricing} />

      {/* Order-editing + back-navigation controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {isCrypto ? "Back to markets" : "Back to pricing"}
        </Button>
        <Button onClick={onContinue} disabled={busy || expired || !quote}>
          {busy ? "Creating order…" : "Continue"}
          {!busy && <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />}
        </Button>
      </div>

      {!reduce && quote && !isCrypto && (
        <p className="text-[11px] text-white/35">
          Price is locked once you continue — the amount charged always comes from your account's
          current plan price on the server.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// STEP 2 — Customer information
// ---------------------------------------------------------------------------
export function CustomerStep({ customer, onChange, onBack, onContinue, busy }) {
  const [touched, setTouched] = useState({});
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email || "");
  const nameOk = (customer.name || "").trim().length >= 2;

  const err = (k) => {
    if (!touched[k]) return undefined;
    if (k === "email" && !emailOk) return "Enter a valid email address for your receipt.";
    if (k === "name" && !nameOk) return "Enter the name associated with your payment method.";
    return undefined;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">Customer information</h3>
        <p className="mt-1 text-xs text-white/45">
          Prefilled from your account. Only what the payment provider needs to issue your receipt is
          collected — no card details are ever entered here.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label="Email for receipt" error={err("email")}>
            <Input
              type="email"
              autoComplete="email"
              value={customer.email}
              onChange={(e) => onChange({ ...customer, email: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              aria-invalid={touched.email && !emailOk}
            />
          </FormField>
          <FormField label="Full name" error={err("name")}>
            <Input
              type="text"
              autoComplete="name"
              value={customer.name}
              onChange={(e) => onChange({ ...customer, name: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              aria-invalid={touched.name && !nameOk}
            />
          </FormField>
          <FormField label="Phone (optional)" className="sm:col-span-2">
            <Input
              type="tel"
              autoComplete="tel"
              placeholder="Used by the payment provider for payment notifications"
              value={customer.phone}
              onChange={(e) => onChange({ ...customer, phone: e.target.value })}
            />
          </FormField>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-white/40">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Order confirmations and payment receipts are sent to this address. We never send payment
          links or requests for your password.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
        </Button>
        <Button onClick={onContinue} disabled={busy || !emailOk || !nameOk}>
          Continue <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STEP 3 — Payment options
// ---------------------------------------------------------------------------
const METHOD_ICONS = { lock: Lock, card: CreditCard, sparkles: Sparkles };

export function PaymentStep({ config, value, method, onSelect, onBack, onContinue, busy }) {
  const methods = config?.paymentMethods || [];
  const cryptoInfo = value?.settlement || config?.crypto;
  const isCrypto = !!value?.asset;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-white">How would you like to pay?</h3>
        <p className="mt-1 text-xs text-white/45">
          Only methods we can actually accept are listed.
        </p>

        {methods.length === 0 ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4" role="status">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              No payment methods available yet
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-100/70">
              {config?.unavailableReason ||
                "Our payment provider isn't configured for this account yet. You can complete the review steps — payment will unlock as soon as it is enabled."}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {methods.map((m) => {
              const Icon = METHOD_ICONS[m.icon] || Lock;
              const selected = method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m.id)}
                  disabled={!m.available}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    selected
                      ? "border-cyan-400/60 bg-cyan-400/[0.07]"
                      : "border-white/10 bg-white/[0.02] hover:border-white/25",
                    !m.available && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                      selected ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/[0.03] text-white/60",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{m.label}</span>
                      {selected && <CheckCircle2 className="h-3.5 w-3.5 text-cyan-300" aria-hidden />}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-white/50">{m.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {isCrypto && cryptoInfo && (
          <p className={cn(
            "mt-4 rounded-xl border p-3 text-xs leading-relaxed",
            cryptoInfo.available
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-100/80",
          )}>
            <span className="font-semibold">{cryptoInfo.label}: </span>
            {cryptoInfo.message}
          </p>
        )}
      </div>

      <SecureNote />

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
        </Button>
        <Button onClick={onContinue} disabled={busy || !method || methods.length === 0}>
          Review order <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STEP 4 — Final review + pay
// ---------------------------------------------------------------------------
export function FinalStep({ order, methodLabel, customer, agreed, onAgree, onBack, onPay, busy, blocked }) {
  if (!order) return <div className="skeleton h-64 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <OrderSummary value={order} />

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/40">Paying with</p>
            <p className="mt-1 text-sm font-medium text-white">{methodLabel}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/40">Receipt to</p>
            <p className="mt-1 truncate text-sm font-medium text-white">{customer.email}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/40">Order reference</p>
            <p className="num mt-1 text-sm font-medium text-white/80">{order.reference}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/40">Amount</p>
            <p className="num mt-1 text-sm font-semibold text-white">
              {fmtCents(order.totalCents, order.currency)}
            </p>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => onAgree(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
          />
          <span className="text-xs leading-relaxed text-white/60">
            I agree to the{" "}
            <a href="/documentation" target="_blank" rel="noreferrer" className="text-cyan-300 underline underline-offset-2">Terms of Service</a>,{" "}
            <a href="/documentation" target="_blank" rel="noreferrer" className="text-cyan-300 underline underline-offset-2">Privacy Policy</a> and{" "}
            <a href="/documentation" target="_blank" rel="noreferrer" className="text-cyan-300 underline underline-offset-2">Refund Policy</a>,
            and understand this order {order.type === "subscription" ? `renews ${intervalText(order.interval, order.intervalCount)} until cancelled` : "is final once the quote is accepted"}.
          </span>
        </label>
      </div>

      {blocked && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100/85">
          {blocked}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
        </Button>
        <Button size="lg" onClick={onPay} disabled={busy || !agreed || blocked} className="min-w-[190px] justify-center">
          {busy ? (
            <><RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Processing…</>
          ) : (
            <><Lock className="h-4 w-4" aria-hidden /> Pay {fmtCents(order.totalCents, order.currency)} securely</>
          )}
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-white/35">
        <Info className="h-3 w-3" aria-hidden />
        {busy
          ? "Confirming with the payment provider — please don't close this window."
          : `You'll complete payment ${paymentWhere(methodLabel)}.`}
      </p>
    </div>
  );
}

// Wording must match how each provider actually behaves: Razorpay overlays a
// window on this page, Stripe continues to a hosted page of its own.
const paymentWhere = (label) => {
  if (/stripe/i.test(label || "")) return "on Stripe's secure payment page";
  if (/razorpay/i.test(label || "")) return "in Razorpay's secure window";
  return "in your provider's secure window";
};
