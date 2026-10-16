import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ReceiptText, ChevronRight, RefreshCw } from "lucide-react";
import { Button, Badge, Segmented, EmptyState } from "../../components/ui.jsx";
import { SkeletonLoader } from "../../components/Loaders.jsx";
import { checkout, fmtCents, intervalText } from "../../lib/checkout.js";
import { cn } from "../../lib/utils.js";

// ---------------------------------------------------------------------------
// Purchase order history (`/checkout/orders`). Deliberately separate from
// `/orders`, which lists paper-trading exchange orders — the two are different
// things and are never mixed in one table.
// ---------------------------------------------------------------------------
const STATUS_TONE = {
  paid: "success", pending: "warning", awaiting_payment: "warning",
  failed: "danger", cancelled: "default", expired: "default", refunded: "violet",
};
const RESULT_PATH = {
  paid: "success", pending: "pending", awaiting_payment: "pending",
  failed: "failed", cancelled: "cancelled", expired: "pending", refunded: "success",
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "subscription", label: "Subscriptions" },
  { value: "crypto", label: "Crypto" },
];

export default function CheckoutOrders() {
  const [items, setItems] = useState(null);
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    setError("");
    const qs = `?page=${page}&limit=10${type ? `&type=${type}` : ""}`;
    checkout.orders(qs)
      .then((d) => { setItems(d?.orders || []); setMeta({ total: d?.total || 0, pages: d?.pages || 1 }); })
      .catch((e) => { setItems([]); setError(e?.message || "Couldn't load your orders."); })
      .finally(() => setBusy(false));
  };

  // Reset to page 1 in the event that caused the filter change (not in an
  // effect) so we never briefly render page 2 of a different filter.
  const onFilter = (v) => { setPage(1); setType(v); };

  useEffect(load, [page, type]);

  return (
    <div className="font-checkout relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[300px] bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(34,211,238,0.09),transparent)]" />

      <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs text-white/45 transition-colors hover:text-white/80">
              ← Dashboard
            </Link>
            <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-white">
              <ReceiptText className="h-5 w-5 text-cyan-300" aria-hidden /> Your orders
            </h1>
            <p className="mt-1 text-xs text-white/45">
              Subscription and purchase orders. Paper-trading orders live under{" "}
              <Link to="/orders" className="text-cyan-300/80 underline underline-offset-2">Orders</Link>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Segmented items={FILTERS} value={type} onChange={onFilter} ariaLabel="Filter orders by type" size="sm" />
            <Button variant="ghost" size="sm" onClick={load} disabled={busy} aria-label="Refresh orders">
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden />
            </Button>
          </div>
        </div>

        <div className="mt-6">
          {items === null ? (
            <SkeletonLoader rows={4} />
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-6 text-center" role="alert">
              <p className="text-sm font-medium text-white">Couldn't load your orders</p>
              <p className="mt-1 text-xs text-white/50">{error}</p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={load}>Try again</Button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No orders yet"
              desc={type ? "No orders of this type." : "Orders you place through checkout will appear here."}
              action={<Button to="/pricing" size="sm">Browse plans</Button>}
            />
          ) : (
            <>
              <ul className="space-y-2.5">
                {items.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/checkout/${RESULT_PATH[o.status] || "pending"}?id=${o.id}`}
                      className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/25"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[10px] font-bold uppercase",
                          o.type === "crypto"
                            ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
                            : "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
                        )}
                      >
                        {o.type === "crypto" ? o.asset?.symbol : "PRO"}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-white">
                            {o.type === "crypto"
                              ? `${o.quantity} ${o.asset?.symbol} — ${o.asset?.name}`
                              : o.planName || o.planSlug}
                          </span>
                          <Badge tone={STATUS_TONE[o.status] || "default"}>{o.status}</Badge>
                          {o.simulated && <Badge tone="violet">simulated</Badge>}
                        </span>
                        <span className="num mt-1 block truncate text-[11px] text-white/40">
                          {o.reference} · {new Date(o.createdAt).toLocaleString()}
                          {o.type === "subscription" && ` · ${intervalText(o.interval, o.intervalCount)}`}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-2">
                        <span className="num text-sm font-semibold text-white">{fmtCents(o.totalCents, o.currency)}</span>
                        <ChevronRight className="h-4 w-4 text-white/30 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {meta.pages > 1 && (
                <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Order pages">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span className="text-xs text-white/45">Page {page} of {meta.pages} · {meta.total} orders</span>
                  <Button variant="secondary" size="sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
