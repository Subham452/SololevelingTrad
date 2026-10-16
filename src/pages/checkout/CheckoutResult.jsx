import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2, Clock, XCircle, AlertOctagon, ArrowRight, RefreshCw,
  ShieldCheck, ReceiptText,
} from "lucide-react";
import { Button, Badge } from "../../components/ui.jsx";
import { PageLoader } from "../../components/Loaders.jsx";
import { checkout, fmtCents } from "../../lib/checkout.js";
import { cn } from "../../lib/utils.js";

// ---------------------------------------------------------------------------
// Payment result pages: /checkout/success | /pending | /failed | /cancelled
//
// Success is only ever rendered when the SERVER reports `paid`. A pending
// order keeps polling; it is never optimistically upgraded to success.
// ---------------------------------------------------------------------------
const STATES = {
  success: {
    icon: CheckCircle2, tone: "text-emerald-400", ring: "border-emerald-500/30 bg-emerald-500/10",
    title: "Payment successful", cta: "Go to dashboard", ctaTo: "/dashboard",
  },
  pending: {
    icon: Clock, tone: "text-amber-300", ring: "border-amber-500/30 bg-amber-500/10",
    title: "Payment pending", cta: "Go to dashboard", ctaTo: "/dashboard",
  },
  failed: {
    icon: AlertOctagon, tone: "text-rose-400", ring: "border-rose-500/30 bg-rose-500/10",
    title: "Payment failed", cta: "Back to dashboard", ctaTo: "/dashboard",
  },
  cancelled: {
    icon: XCircle, tone: "text-white/60", ring: "border-white/15 bg-white/[0.03]",
    title: "Payment cancelled", cta: "Back to pricing", ctaTo: "/pricing",
  },
};

const TERMINAL = ["paid", "failed", "cancelled", "expired", "refunded"];

export default function CheckoutResult({ state = "success" }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const id = params.get("id");

  const [order, setOrder] = useState(null);
  const [err, setErr] = useState("");
  // Read once at mount (not in an effect) — a provider failure reason is only
  // ever a short, non-sensitive message we stashed before redirecting here.
  const [providerError] = useState(() => (id ? sessionStorage.getItem(`checkout:error:${id}`) || "" : ""));
  const pollRef = useRef(null);

  const meta = STATES[state] || STATES.success;
  const Icon = meta.icon;

  useEffect(() => {
    if (!id) return undefined;

    let alive = true;
    const load = async () => {
      try {
        let o = await checkout.order(id);
        if (!alive) return;
        // Hosted checkout redirects back here before any webhook may have
        // arrived. Ask Stripe to confirm server-side (via the verify path,
        // which also records history and grants entitlement exactly once) so
        // the order settles even on a deployment with no webhook configured.
        // The browser never asserts that it paid — Stripe answers.
        if (o?.status === "awaiting_payment" && o.provider === "stripe" && o.providerOrderId) {
          await checkout.verify({ orderId: o.providerOrderId }).catch(() => {});
          o = await checkout.order(id).catch(() => o);
        }
        if (!alive) return;
        setOrder(o);
        if (o?.status && TERMINAL.includes(o.status)) {
          // Never keep polling once the server has settled the order.
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          // If the server disagrees with the URL state, defer to the server.
          if (o.status === "paid" && state !== "success") navigate(`/checkout/success?id=${id}`, { replace: true });
          if (o.status !== "paid" && state === "success") navigate(`/checkout/pending?id=${id}`, { replace: true });
        }
      } catch (e) {
        if (alive) setErr(e?.message || "We couldn't load this order.");
      }
    };

    load();
    if (state === "pending") {
      pollRef.current = setInterval(load, 3000);
    }
    return () => { alive = false; if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [id, state, navigate]);

  if (!id) {
    return (
      <Shell>
        <ResultCard state={state} meta={meta} Icon={Icon} reduce={reduce}>
          <p className="text-sm text-white/55">No order reference was supplied for this page.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button to="/checkout/orders" size="sm" variant="secondary">Order history</Button>
            <Button to="/pricing" size="sm">View pricing</Button>
          </div>
        </ResultCard>
      </Shell>
    );
  }

  if (!order && !err) {
    return (
      <Shell>
        <PageLoader label="Confirming your payment" />
      </Shell>
    );
  }

  return (
    <Shell>
      <ResultCard state={state} meta={meta} Icon={Icon} reduce={reduce}>
        {err && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100/85" role="alert">
            {err} Your order is stored — you can safely retry.
          </div>
        )}

        {order && (
          <dl className="mt-5 divide-y divide-white/[0.07] rounded-xl border border-white/10 bg-white/[0.02] px-4 text-left">
            <Row k="Order reference" v={order.reference} mono />
            <Row
              k="Item"
              v={order.type === "crypto"
                ? `${order.quantity} ${order.asset?.symbol} (${order.asset?.name})`
                : `${order.planName} subscription`}
            />
            <Row k="Amount" v={fmtCents(order.totalCents, order.currency)} mono strong />
            <Row k="Status" v={<Badge tone={order.status === "paid" ? "success" : order.status === "pending" ? "warning" : "danger"}>{order.status}</Badge>} />
            <Row k="Placed" v={new Date(order.createdAt).toLocaleString()} />
            {order.paidAt && <Row k="Confirmed" v={new Date(order.paidAt).toLocaleString()} mono />}
            {order.providerOrderId && <Row k="Provider reference" v={order.providerOrderId} mono />}
          </dl>
        )}

        {providerError && state === "failed" && (
          <p className="mt-3 text-left text-xs text-rose-300/90">{providerError}</p>
        )}

        {/* Next steps — explicit per state, never a dead end. */}
        <div className="mt-5 text-left">
          <p className="text-[11px] uppercase tracking-widest text-white/40">What happens next</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/55">
            {state === "success" && (
              <>
                <li>• Your receipt has been emailed to you.</li>
                <li>• {order?.type === "subscription" ? "Premium entitlements are active on your account." : "Your order has been recorded in your order history."}</li>
              </>
            )}
            {state === "pending" && (
              <>
                <li>• We're waiting for the payment provider to confirm — this page updates automatically.</li>
                <li>• Don't pay again; refreshing is safe and will never create a second charge.</li>
              </>
            )}
            {state === "failed" && (
              <>
                <li>• No money was taken for a failed payment.</li>
                <li>• You can retry with the same order — no duplicate charge is possible.</li>
              </>
            )}
            {state === "cancelled" && (
              <>
                <li>• You left the payment window before completing payment.</li>
                <li>• Your order is saved — resume it whenever you're ready.</li>
              </>
            )}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {(state === "failed" || state === "cancelled") && order && !TERMINAL.includes(order.status) && (
            <Button size="sm" onClick={() => navigate(`/checkout?order=${order.id}`)}>
              Resume this order <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
          <Button size="sm" variant="secondary" to="/checkout/orders">
            <ReceiptText className="h-3.5 w-3.5" aria-hidden /> Order history
          </Button>
          <Button size="sm" variant={state === "success" ? "primary" : "secondary"} to={meta.ctaTo}>
            {meta.cta} <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-white/35">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" aria-hidden />
          {state === "success"
            ? "Access was granted only after the server verified this payment."
            : "Payment status reflects confirmed provider data only — never an optimistic guess."}
        </p>
      </ResultCard>
    </Shell>
  );
}

function Row({ k, v, mono, strong }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-xs text-white/40">{k}</dt>
      <dd className={cn("min-w-0 truncate text-right text-sm", mono && "num", strong ? "font-semibold text-white" : "text-white/80")}>{v}</dd>
    </div>
  );
}

function ResultCard({ state, meta, Icon, reduce, children }) {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[radial-gradient(ellipse_55%_45%_at_50%_-10%,rgba(34,211,238,0.10),transparent)]" />
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-lg px-4 py-10"
      >
        <div className={cn("rounded-2xl border p-6 text-center backdrop-blur-xl sm:p-8", meta.ring)}>
          <motion.span
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, type: "spring", stiffness: 240, damping: 18 }}
            className={cn("mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-black/40", meta.tone)}
          >
            <Icon className="h-7 w-7" aria-hidden />
          </motion.span>

          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-white">{meta.title}</h1>
          {state === "pending" && (
            <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-white/50">
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden /> Checking with your payment provider…
            </p>
          )}

          <div className="mt-2">{children}</div>
        </div>
      </motion.div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="font-checkout relative min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
