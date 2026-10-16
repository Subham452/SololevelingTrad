import { useCallback, useEffect, useState } from "react";
import { Bell, Megaphone, Send, Users2 } from "lucide-react";
import { adminApi } from "../../lib/admin.js";
import { useAuth } from "../../context/useAuth.js";
import { Badge, Button, Input, Panel, FormField } from "../../components/ui.jsx";
import { ConfirmDialog, PageHeader, RefreshButton } from "../../components/admin/primitives.jsx";
import NeonGlowToggle from "../../components/admin/NeonGlowToggle.jsx";
import { fmtDate } from "../../components/admin/format.js";

export default function AdminSettings() {
  const { user: me } = useAuth();
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentErr, setRecentErr] = useState("");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetIds, setTargetIds] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const flash = (msg, ok = true) => setToast({ msg, ok });
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const loadHealth = useCallback(() => {
    setHealthLoading(true);
    adminApi.health().then(setHealth).catch(() => setHealth(null)).finally(() => setHealthLoading(false));
  }, []);

  const loadRecent = useCallback(() => {
    setRecentLoading(true); setRecentErr("");
    adminApi.audit({ action: "send_notification", limit: 10 })
      .then((d) => setRecent(d?.items || []))
      .catch((e) => setRecentErr(e?.message || "Failed to load history"))
      .finally(() => setRecentLoading(false));
  }, []);

  useEffect(() => { loadHealth(); loadRecent(); }, [loadHealth, loadRecent]);

  const sendBroadcast = async () => {
    setSending(true);
    try {
      const ids = targetIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const payload = { title: title.trim(), body: body.trim() };
      if (ids.length) payload.userIds = ids;
      const d = await adminApi.sendNotification(payload);
      flash(`Delivered to ${d?.count ?? 0} user(s)`);
      setTitle(""); setBody(""); setTargetIds("");
      setConfirmOpen(false);
      loadRecent();
    } catch (e) { flash(e?.message || "Send failed", false); } finally { setSending(false); }
  };

  const canSend = me?.role === "superadmin" || me?.role === "admin";
  const ready = title.trim() && body.trim();

  return (
    <div>
      <PageHeader
        title="Settings"
        desc="Platform configuration and targeted notifications."
        actions={<RefreshButton onClick={() => { loadHealth(); loadRecent(); }} loading={healthLoading || recentLoading} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Send notification" desc="In-app notification delivered to user dashboards">
          {!canSend ? (
            <p className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-xs text-amber-200">
              <Bell className="h-4 w-4 shrink-0" aria-hidden />
              Sending notifications requires the <Badge tone="warning">admin</Badge> or <Badge tone="warning">superadmin</Badge> role.
            </p>
          ) : (
            <>
              <FormField label="Title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scheduled maintenance tonight" maxLength={120} />
              </FormField>
              <FormField label="Message" className="mt-3">
                <textarea
                  value={body} onChange={(e) => setBody(e.target.value)} rows={4}
                  placeholder="We'll be performing database maintenance from 02:00–02:30 IST."
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                  maxLength={500}
                />
              </FormField>
              <div className="mt-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-white/60">Target user ids <span className="text-white/35">— leave empty to broadcast to all users</span></span>
                  <Input
                    value={targetIds} onChange={(e) => setTargetIds(e.target.value)}
                    placeholder="Optional — comma separated ObjectIds"
                    className="num"
                  />
                </label>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  size="sm" disabled={!ready} loading={sending}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Send className="h-3.5 w-3.5" /> Review & send
                </Button>
                <span className="text-[11px] text-white/35">
                  <Users2 className="mr-1 inline h-3 w-3" aria-hidden />
                  {targetIds.trim() ? "Targeted delivery" : "Broadcast to every user"}
                </span>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Recent notification history" desc="Audit entries for sent broadcasts">
          {recentLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />)}</div>}
          {!recentLoading && recentErr && <p className="text-xs text-rose-400">{recentErr}</p>}
          {!recentLoading && !recentErr && recent.length === 0 && (
            <p className="py-6 text-center text-xs text-white/40">No notifications sent yet.</p>
          )}
          <ul className="space-y-2.5">
            {recent.map((a) => (
              <li key={a._id} className="rounded-lg border border-white/[0.07] px-3 py-2">
                <p className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/80"><Megaphone className="mr-1.5 inline h-3 w-3 text-cyan-300" aria-hidden />{a.action}</span>
                  <span className="text-white/40">{fmtDate(a.createdAt)}</span>
                </p>
                {a.meta && <p className="mt-1 text-[11px] text-white/45">Sent to {a.meta.count ?? "?"} recipient(s) by {a.actorId?.email || "system"}</p>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Your access" desc="Effective role and permissions">
          <dl className="divide-y divide-white/[0.06] text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-white/60">Signed in as</dt>
              <dd className="text-white/85">{me?.email}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-white/60">Role</dt>
              <dd className="flex items-center gap-2">
                <Badge tone="accent">{me?.role}</Badge>
                {me?.emailVerified && <Badge tone="success">verified</Badge>}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-white/60">Backend reachable</dt>
              <dd>{health ? <Badge tone={health.status === "healthy" ? "success" : "warning"}>{health.status}</Badge> : <Badge tone="danger">unreachable</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-white/60">Node</dt>
              <dd className="num text-white/70">{health?.node || "—"}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Environment configuration" desc="Backend .env keys (names only)">
          <p className="text-xs text-white/55">
            Server-side configuration lives in <span className="num text-white/80">backend/.env</span>. Copy <span className="num text-white/80">.env.example</span> and fill in values — secrets are never sent to the browser.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 text-[11px] text-white/50 sm:grid-cols-2">
            {[
              ["MONGODB_URI", "database"],
              ["JWT_ACCESS_SECRET", "sessions"],
              ["JWT_REFRESH_SECRET", "sessions"],
              ["PAYMENT_PROVIDER", "razorpay | stripe"],
              ["RAZORPAY_KEY_ID / SECRET", "refunds"],
              ["STRIPE_SECRET_KEY", "refunds"],
              ["FIREBASE_*", "consumer auth"],
              ["VIDEOSDK_*", "calls & live"],
            ].map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] px-2.5 py-1.5">
                <span className="num truncate text-white/70">{k}</span>
                <span className="shrink-0 text-white/35">{v}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Appearance" desc="Display preferences for this browser">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-white/85">Neon glow effects</p>
              <p className="mt-0.5 max-w-lg text-xs text-white/45">
                Cyan and violet illumination across the admin panel — titles, KPI figures, cards, badges
                and charts. Stored on this device only and never applied to user dashboards.
              </p>
            </div>
            <NeonGlowToggle />
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Send this notification?"
        description={`“${title}” — ${body.slice(0, 140)}${body.length > 140 ? "…" : ""}`}
        confirmLabel="Send now"
        loading={sending}
        tone="primary"
        onCancel={() => !sending && setConfirmOpen(false)}
        onConfirm={sendBroadcast}
      />

      {toast && (
        <div
          role="status" aria-live="polite"
          className={`fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full border px-4 py-2 text-sm backdrop-blur-xl ${toast.ok ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border-rose-500/40 bg-rose-500/15 text-rose-200"}`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
