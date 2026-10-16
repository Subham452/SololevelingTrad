// Unified checkout client. Everything here talks to the backend — the browser
// never computes or supplies a price. Errors are surfaced with their server
// `code` so the UI can render an honest state (unconfigured provider, expired
// quote, settlement unavailable…) instead of a generic failure.
import { api } from "./api.js";

export const checkout = {
  config: () => api.get("/checkout/config"),
  quote: (payload) => api.post("/checkout/quote", payload),
  createOrder: (payload) => api.post("/checkout/orders", payload),
  paymentSession: (orderId) => api.post("/checkout/payment-session", { orderId }),
  completeSimulated: (orderId) => api.post("/checkout/complete-simulated", { orderId }),
  orders: (qs = "") => api.get(`/checkout/orders${qs}`),
  order: (id) => api.get(`/checkout/orders/${id}`),
  status: (id) => api.get(`/checkout/orders/${id}/status`),
  verify: (payload) => api.post("/payments/verify", payload),
};

// ---------------------------------------------------------------------------
// Money formatting — integer minor units only.
// ---------------------------------------------------------------------------
export function fmtCents(cents, currency = "USD") {
  const n = Number(cents ?? 0);
  const sym = currency === "USD" ? "$" : currency === "INR" ? "₹" : `${currency} `;
  const value = (n / 100).toLocaleString("en-US", {
    minimumFractionDigits: n % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${sym}${value}`;
}

export const intervalText = (interval, count = 1) => {
  const n = Number(count || 1);
  if (interval === "year") return n > 1 ? `every ${n} years` : "yearly";
  return n > 1 ? `every ${n} months` : "monthly";
};

// ---------------------------------------------------------------------------
// Provider SDK loaders. Scripts are loaded on demand and cached — the provider
// bundle is never fetched until the user actually reaches payment.
// ---------------------------------------------------------------------------
const loaders = new Map();
function loadScript(src, check) {
  if (check()) return Promise.resolve();
  if (loaders.has(src)) return loaders.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Couldn't load the payment provider's secure checkout. Check your connection and try again.`));
    document.body.appendChild(s);
  });
  loaders.set(src, p);
  return p;
}

export const loadRazorpay = () =>
  loadScript("https://checkout.razorpay.com/v1/checkout.js", () => !!window.Razorpay);

// ---------------------------------------------------------------------------
// Submit the created order to the provider.
//
// Returns a promise settled by the provider's own callbacks:
//   resolve({ ok: true,  ... })  verified server-side
//   resolve({ ok: false, reason: 'cancelled' | 'failed' })
//   reject(err)                  configuration / network problem
// ---------------------------------------------------------------------------
export function openRazorpay({ session, customer, onVerify }) {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) { reject(new Error("Secure checkout didn't load.")); return; }
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };

    const rzp = new window.Razorpay({
      key: session.keyId,
      amount: session.amountCents, // integer minor units, server-set
      currency: session.currency,
      name: "SololevelingTrad",
      description: session.order?.planName || session.order?.asset?.name || session.order?.reference || "Order",
      order_id: session.providerOrderId,
      prefill: { name: customer?.name || "", email: customer?.email || "", contact: customer?.phone || "" },
      notes: { reference: session.order?.reference || "" },
      theme: { color: "#22d3ee" },
      modal: { ondismiss: () => done({ ok: false, reason: "cancelled" }) },
      handler: async (resp) => {
        try {
          // Send the provider's signature material back for SERVER-SIDE verification.
          await onVerify({
            orderId: session.providerOrderId,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature,
          });
          done({ ok: true, providerPaymentId: resp.razorpay_payment_id });
        } catch (e) {
          done({ ok: false, reason: "failed", error: e?.message || "Verification failed" });
        }
      },
    });
    rzp.on("payment.failed", (r) =>
      done({ ok: false, reason: "failed", error: r?.error?.description || "The payment didn't complete." }));
    rzp.open();
  });
}
