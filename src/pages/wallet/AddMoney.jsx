import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, AlertTriangle, ShieldCheck } from "lucide-react";
import { walletApi, fmtMinor, makeIdempotencyKey } from "../../lib/wallet.js";
import { mountWhopCheckout } from "../../lib/whop.js";
import { Card, Badge, Button, Panel, EmptyState, LoadingState } from "../../components/ui.jsx";

// ---------------------------------------------------------------------------
// Add money (real funds).
//
// Three honest states, never a fake success:
//   1. unavailable  — the feature is gated off (provider approval / config)
//   2. ready        — pick a server-defined preset, open Whop's hosted checkout
//   3. awaiting     — deposit created; we poll the SERVER for the signed webhook
//                     result. The return URL's `status` param is display only.
// ---------------------------------------------------------------------------
export default function AddMoney() {
  const [config, setConfig] = useState(null);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null);

  const [busy, setBusy] = useState(false);
  const [deposit, setDeposit] = useState(null);
  const [checkoutInfo, setCheckoutInfo] = useState(null);
  const [stage, setStage] = useState("idle"); // idle | creating | checkout | awaiting | confirmed | failed
  const [actionErr, setActionErr] = useState("");
  const [verifying, setVerifying] = useState(false);

  const mountRef = useRef(null);
  const widgetRef = useRef(null);
  // One key per "attempt" so double-clicks collapse into a single deposit.
  const keyRef = useRef(null);

  useEffect(() => {
    walletApi.config().then(setConfig).catch((e) => setErr(e?.message || "Could not load the wallet config"));
  }, []);

  const availability = config?.availability;
  const presets = config?.presets || [];

  // Keep a single idempotency key per selection so retries are free.
  useEffect(() => {
    keyRef.current = null;
    setDeposit(null);
    setCheckoutInfo(null);
    setStage("idle");
    setActionErr("");
  }, [selected]);

  // Poll the server while the deposit is still unresolved. Nothing here
  // concludes anything from the browser — only the server's record counts.
  useEffect(() => {
    if (!deposit || deposit.terminal) return undefined;
    let alive = true;
    let timer;
    const tick = async () => {
      try {
        const d = await walletApi.deposit(deposit.reference);
        if (!alive) return;
        setDeposit(d?.deposit || deposit);
        if (d?.deposit?.status === "paid") setStage("confirmed");
        else if (d?.deposit && ["failed", "expired", "refunded"].includes(d.deposit.status)) setStage("failed");
        else if (stage === "awaiting") timer = setTimeout(tick, 4000);
      } catch {
        if (alive) timer = setTimeout(tick, 8000); // back off on transient errors
      }
    };
    if (stage === "awaiting") timer = setTimeout(tick, 4000);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [deposit, stage]);

  // Mount Whop's element as soon as we have a server-approved checkout config.
  useEffect(() => {
    if (stage !== "checkout" || !checkoutInfo || !mountRef.current) return undefined;
    let alive = true;
    let widget = null;
    (async () => {
      try {
        widget = await mountWhopCheckout({
          planId: checkoutInfo.planId,
          environment: checkoutInfo.environment,
          metadata: checkoutInfo.metadata,
          returnUrl: checkoutInfo.returnUrl,
          container: mountRef.current,
          // Analytics only — never fulfilment. The webhook is what credits.
          onComplete: () => {},
        });
        widgetRef.current = widget;
      } catch (e) {
        if (alive) {
          setActionErr(e?.message || "Could not open the payment form");
          setStage("creating");
        }
      }
    })();
    return () => {
      alive = false;
      if (widget) { try { widget.destroy(); } catch { /* best effort */ } }
      widgetRef.current = null;
    };
  }, [stage, checkoutInfo]);

  const startDeposit = async () => {
    if (!selected) return;
    setBusy(true);
    setActionErr("");
    setStage("creating");
    try {
      keyRef.current = keyRef.current || makeIdempotencyKey();
      const r = await walletApi.createDeposit(selected, keyRef.current);
      setDeposit(r?.deposit || null);
      setCheckoutInfo(r?.checkout || null);
      if (!r?.checkout?.configured) {
        setActionErr("Wallet payments are not configured on the server yet.");
        setStage("idle");
      } else {
        setStage("checkout");
      }
    } catch (e) {
      setActionErr(e?.message || "Could not start the deposit");
      setStage("idle");
    } finally {
      setBusy(false);
    }
  };

  const verifyNow = async () => {
    if (!deposit) return;
    setVerifying(true);
    setActionErr("");
    try {
      const hint = new URLSearchParams(window.location.search).get("payment") || undefined;
      const r = await walletApi.verifyDeposit(deposit.reference, hint);
      if (r?.deposit) setDeposit(r.deposit);
      if (r?.confirmed && r?.deposit?.status === "paid") setStage("confirmed");
    } catch (e) {
      setActionErr(e?.message || "Could not confirm the payment yet");
    } finally {
      setVerifying(false);
    }
  };

  // ------------------------------------------------------------------ states
  if (err) return <Card error={err} />;
  if (!config) return <LoadingState label="Loading" rows={3} />;

  if (stage === "confirmed") {
    return (
      <div className="space-y-4">
        <Panel title="Payment confirmed" desc="Credited from the payment provider's confirmation">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <p className="text-sm text-white">
                {fmtMinor(deposit?.amountMinor, deposit?.currency)} confirmed for reference{" "}
                <span className="font-mono">{deposit?.reference}</span>.
              </p>
              <p className="mt-1 text-xs text-white/50">
                It is now part of your available balance. This credit came from a signed server-side event, not from this page.
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="accent" size="sm" to="/wallet">Back to wallet</Button>
            <Button variant="secondary" size="sm" to="/wallet/transactions">View history</Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-white">Add money</h2>
          <p className="mt-1 text-xs text-white/50">Real funds — processed and confirmed by Whop.</p>
        </div>
        <Link to="/wallet" className="text-xs text-cyan-300 hover:text-cyan-200">← Back to wallet</Link>
      </div>

      {/* Honest availability banner */}
      {availability && !availability.available ? (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-medium text-amber-200">
                Top-ups are unavailable{availability.reasonCode ? ` (${availability.reasonCode})` : ""}
              </p>
              <p className="mt-1 text-xs text-amber-100/70">{availability.reason}</p>
              <p className="mt-2 text-[11px] text-white/45">
                Subscription purchases are unaffected and remain available on the pricing page.
              </p>
              <Button variant="secondary" size="sm" className="mt-3" to="/pricing">View plans</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Amount presets (server-defined only) */}
      <Panel title="Choose an amount" desc="Amounts are defined on the server and priced by the Whop checkout link.">
        {presets.length === 0 ? (
          <EmptyState title="No amounts configured" desc="An administrator must add Whop checkout links before deposits can start." />
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Deposit amount">
            {presets.map((p) => (
              <button
                key={p.amountMinor}
                type="button"
                role="radio"
                aria-checked={selected === p.amountMinor}
                disabled={stage === "checkout" || stage === "awaiting"}
                onClick={() => setSelected(p.amountMinor)}
                className={`rounded-xl border px-5 py-3 text-sm font-semibold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:opacity-50 ${
                  selected === p.amountMinor
                    ? "border-cyan-400/60 bg-cyan-400/15 text-white"
                    : "border-white/10 bg-white/5 text-white/70 hover:border-white/25"
                }`}
              >
                {fmtMinor(p.amountMinor, config.currency)}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-white/45">
          <span>
            Limits: {fmtMinor(config.limits.minMinor, config.currency)} – {fmtMinor(config.limits.maxMinor, config.currency)}
          </span>
          <span>Platform deposit fee: none</span>
          <span>Payment processor: {config.provider?.label} ({config.provider?.environment})</span>
        </div>

        {actionErr ? <Card error={actionErr} className="mt-3" /> : null}

        {stage === "awaiting" && deposit ? (
          <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="warning">Awaiting confirmation</Badge>
              <span className="text-lg font-semibold tabular-nums text-white">{fmtMinor(deposit.amountMinor, deposit.currency)}</span>
              <span className="font-mono text-[11px] text-white/40">{deposit.reference}</span>
            </div>
            <p className="text-xs text-white/55">
              We are waiting for the payment provider to confirm this deposit. Your balance only changes once it does.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={verifying} onClick={verifyNow}>
                {!verifying && <ShieldCheck className="h-4 w-4" />} Check payment status
              </Button>
              <Link to={`/wallet/transactions?deposit=${encodeURIComponent(deposit.reference)}`} className="self-center text-xs text-cyan-300 hover:text-cyan-200">
                Open in history
              </Link>
            </div>
          </div>
        ) : null}

        {stage === "checkout" && checkoutInfo ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-white/50">
                {checkoutInfo.environment === "sandbox"
                  ? "Sandbox mode — no real money moves."
                  : "Live mode — your payment method will be charged."}
              </p>
              <Button size="sm" variant="ghost" onClick={() => { if (widgetRef.current) widgetRef.current.destroy(); setStage("awaiting"); }}>
                I finished paying
              </Button>
            </div>
            <div ref={mountRef} className="min-h-[280px] rounded-xl border border-white/10 bg-white/[0.02] p-2" />
            <p className="text-[11px] text-white/40">
              Payment details are handled entirely by Whop. This app never sees or stores your card.
            </p>
          </div>
        ) : null}

        {stage !== "checkout" && stage !== "awaiting" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="accent" size="sm" loading={busy} disabled={!selected || !availability?.available} onClick={startDeposit}>
              {!busy && <Plus className="h-4 w-4" />} Continue to payment
            </Button>
            {!selected ? <span className="text-xs text-white/40">Select an amount to continue.</span> : null}
          </div>
        ) : null}
      </Panel>

      <Panel title="What happens next" desc="No surprises.">
        <ol className="list-decimal space-y-1.5 pl-5 text-xs text-white/55">
          <li>You choose an amount and pay through Whop's hosted checkout.</li>
          <li>Whop sends this server a signed webhook. Only that confirms the deposit.</li>
          <li>Once confirmed, the amount moves from <em className="text-white/75 not-italic">Pending</em> to <em className="text-white/75 not-italic">Available</em>.</li>
          <li>Closing this page or refreshing does not cancel an already-completed payment.</li>
        </ol>
      </Panel>
    </div>
  );
}
