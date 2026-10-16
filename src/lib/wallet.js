// Real-money wallet API client. All money crossing this boundary is integer
// minor units — the browser never computes, rounds or asserts a price, a
// balance or a payment status.
import { api } from "./api.js";

const qs = (params = {}) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const walletApi = {
  summary: () => api.get("/wallet"),
  config: () => api.get("/wallet/config"),
  transactions: (p = {}) => api.get(`/wallet/transactions${qs(p)}`),
  transaction: (id) => api.get(`/wallet/transactions/${id}`),

  // Deposits. `idempotencyKey` collapses repeated submits into one record.
  createDeposit: (amountMinor, idempotencyKey) =>
    api.post("/wallet/deposits", { amountMinor, idempotencyKey }),
  deposit: (reference) => api.get(`/wallet/deposits/${encodeURIComponent(reference)}`),
  // Server-to-server confirmation; the return URL is never proof of payment.
  verifyDeposit: (reference, paymentId) =>
    api.post(`/wallet/deposits/${encodeURIComponent(reference)}/verify`, { paymentId }),
};

// ---------------------------------------------------------------------------
// Money formatting from integer minor units (no floating-point storage).
// ---------------------------------------------------------------------------
export function fmtMinor(minor, currency = "USD") {
  const n = Number(minor ?? 0);
  const sym = currency === "USD" ? "$" : currency === "INR" ? "₹" : `${currency} `;
  const value = (n / 100).toLocaleString("en-US", {
    minimumFractionDigits: n % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${sym}${value}`;
}

/** Status tone + human label for a deposit row. */
export const DEPOSIT_STATUS = {
  pending: { tone: "warning", label: "Pending" },
  paid: { tone: "success", label: "Confirmed" },
  failed: { tone: "danger", label: "Failed" },
  expired: { tone: "default", label: "Expired" },
  refunded: { tone: "violet", label: "Refunded" },
};

/** Ledger row sign/label so history reads correctly at a glance. */
export const LEDGER_TYPE = {
  deposit_hold: { label: "Deposit started", sign: "", tone: "warning" },
  deposit_credit: { label: "Deposit confirmed", sign: "+", tone: "success" },
  deposit_expired: { label: "Deposit expired", sign: "", tone: "default" },
  deposit_failed: { label: "Deposit failed", sign: "", tone: "danger" },
  deposit_reversed: { label: "Refund", sign: "-", tone: "danger" },
  withdrawal_hold: { label: "Withdrawal started", sign: "", tone: "warning" },
  withdrawal_debit: { label: "Withdrawal", sign: "-", tone: "default" },
  withdrawal_released: { label: "Withdrawal released", sign: "", tone: "default" },
  adjustment: { label: "Adjustment", sign: "", tone: "violet" },
  fee: { label: "Fee", sign: "-", tone: "default" },
  spend: { label: "Payment", sign: "-", tone: "default" },
  spend_refund: { label: "Payment refunded", sign: "+", tone: "success" },
};

/** Stable idempotency key for repeated "Add money" clicks in this session. */
export function makeIdempotencyKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
