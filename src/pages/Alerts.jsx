import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BellOff, BellPlus, BellRing, Check, Pause, Play, Trash2 } from "lucide-react";
import { marketApi, fmtUsd } from "../lib/market.js";
import { useAlerts, addAlert, removeAlert, updateAlert, rearmAlert, clearTriggered } from "../lib/alerts.js";
import { useCoinPrices } from "../lib/useCoins.js";
import { useAuth } from "../context/useAuth.js";
import { Panel, Button, Badge, EmptyState, Input, Segmented, FormField } from "../components/ui.jsx";
import { cn } from "../lib/utils.js";
import Modal from "../components/app/Modal.jsx";
import CoinImg from "../components/app/CoinImg.jsx";
import { announcementsApi } from "../lib/announcements.js";

function AnnouncementsFeed() {
  const [feed, setFeed] = useState(null);
  useEffect(() => { announcementsApi.feed().then(setFeed).catch(() => {}); }, []);
  const items = feed?.items || [];
  if (!items.length) return null;
  return (
    <Panel title={`Platform notices${feed?.unread ? ` (${feed.unread} unread)` : ""}`} desc="Official announcements from the team">
      <ul className="space-y-2">
        {items.slice(0, 5).map((a) => (
          <li key={a._id} className="flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{a.pinned ? "📌 " : ""}{a.title} {!a.read && <span className="ml-1 rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[10px] text-cyan-200">new</span>}</p>
              <p className="mt-0.5 text-xs text-white/55">{a.body}</p>
            </div>
            {!a.read && <button onClick={() => announcementsApi.markRead(a._id).then(() => announcementsApi.feed().then(setFeed).catch(() => {}))} className="shrink-0 text-[11px] text-cyan-300 hover:underline">Mark read</button>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Price alerts — real, configurable, per-asset threshold alerts evaluated
 * against live backend market data while the app is open (see the honesty
 * note on the page). Stored on this device; no server round-trip.
 */
export default function Alerts() {
  const { authenticated } = useAuth();
  const alerts = useAlerts();
  const [params, setParams] = useSearchParams();

  const [open, setOpen] = useState(false);
  const [coin, setCoin] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [direction, setDirection] = useState("above");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [permission, setPermission] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));

  // Deep-link support: /alerts?coin=bitcoin&name=Bitcoin&symbol=BTC
  useEffect(() => {
    const c = params.get("coin");
    if (!c) return;
    setCoin({ id: c, name: params.get("name") || c, symbol: (params.get("symbol") || "").toUpperCase(), image: null });
    setOpen(true);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced coin search for the picker.
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const d = await marketApi.search(q.trim());
        setResults(d?.results || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const coinIds = useMemo(() => [...new Set(alerts.map((a) => a.coinId))], [alerts]);
  const { byId } = useCoinPrices(coinIds);

  const submit = (e) => {
    e.preventDefault();
    const p = Number(price);
    if (!coin) return setFormError("Pick an asset first.");
    if (!p || p <= 0 || Number.isNaN(p)) return setFormError("Enter a valid target price.");
    addAlert({ coinId: coin.id, name: coin.name, symbol: coin.symbol, image: coin.image, direction, price: p, note: note.trim() });
    setOpen(false); setCoin(null); setQ(""); setPrice(""); setNote(""); setFormError("");
  };

  const requestNotif = async () => {
    try { setPermission(await Notification.requestPermission()); } catch { setPermission("denied"); }
  };

  const active = alerts.filter((a) => a.enabled && !a.triggeredAt);
  const triggered = alerts.filter((a) => a.triggeredAt);
  const paused = alerts.filter((a) => !a.enabled && !a.triggeredAt);

  return (
    <div className="space-y-4">
      <AnnouncementsFeed />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-white">Price alerts</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-white/40">
            Get notified when an asset crosses a threshold. Alerts are checked against live market prices every minute while
            SololevelingTrad is open in this browser.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {permission === "default" && (
            <Button size="sm" variant="secondary" onClick={requestNotif}><BellRing size={13} /> Enable notifications</Button>
          )}
          <Button size="sm" onClick={() => setOpen(true)}><BellPlus size={13} /> New alert</Button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <Panel>
          <EmptyState
            title="No alerts yet"
            copy="Create a threshold alert — for example, notify me when Bitcoin moves above a price — and it will be evaluated against real market data while the app is open."
            action={<Button size="sm" onClick={() => setOpen(true)}><BellPlus size={13} /> Create your first alert</Button>}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {[["Active", active], ["Triggered", triggered], ["Paused", paused]].map(([label, group]) => (
            <Panel key={label} title={label} desc={`${group.length} alert${group.length === 1 ? "" : "s"}`}>
              {group.length === 0 ? (
                <p className="py-4 text-center text-xs text-white/35">Nothing here.</p>
              ) : (
                <ul className="space-y-2">
                  {group.map((a) => {
                    const cur = byId[a.coinId]?.price;
                    return (
                      <li key={a.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                        <div className="flex items-center gap-2.5">
                          <CoinImg src={a.image || byId[a.coinId]?.image} symbol={a.symbol} size="h-7 w-7" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{a.name}</p>
                            <p className="text-[11px] uppercase text-white/35">{a.symbol}</p>
                          </div>
                          {a.triggeredAt ? (
                            <Badge tone="success"><Check size={10} /> Fired</Badge>
                          ) : a.enabled ? (
                            <Badge tone="accent">Watching</Badge>
                          ) : (
                            <Badge tone="warning"><Pause size={10} /> Paused</Badge>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-white/60">
                            {a.direction === "above" ? "Rises above" : "Falls below"} <span className="num font-semibold text-white">{fmtUsd(a.price)}</span>
                          </span>
                          <span className="text-white/40">
                            now <span className={cn("num", cur != null && ((a.direction === "above" && cur >= a.price) || (a.direction === "below" && cur <= a.price)) ? "text-emerald-300" : "text-white/70")}>{cur != null ? fmtUsd(cur) : "—"}</span>
                          </span>
                        </div>
                        {cur != null && (
                          <p className="num mt-1 text-[10px] text-white/30">
                            {(a.direction === "above" ? (a.price - cur) / cur * 100 : (cur - a.price) / cur * 100).toFixed(2)}% away
                          </p>
                        )}
                        {a.note && <p className="mt-1.5 text-[11px] italic text-white/40">“{a.note}”</p>}
                        {a.triggeredAt && (
                          <p className="mt-1.5 text-[10px] text-emerald-300/80">
                            Triggered {new Date(a.triggeredAt).toLocaleString()} at {fmtUsd(a.triggerPrice)}
                          </p>
                        )}
                        <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.06] pt-2">
                          {a.triggeredAt ? (
                            <button onClick={() => rearmAlert(a.id)} className="rounded-lg px-2 py-1 text-[11px] text-cyan-300 transition hover:bg-cyan-500/10">Re-arm</button>
                          ) : (
                            <button onClick={() => updateAlert(a.id, { enabled: !a.enabled })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/[0.06] hover:text-white">
                              {a.enabled ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
                            </button>
                          )}
                          <button onClick={() => removeAlert(a.id)} aria-label="Delete alert" className="ml-auto rounded-lg p-1.5 text-white/35 transition hover:bg-rose-500/10 hover:text-rose-300">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          ))}
        </div>
      )}

      {triggered.length > 0 && (
        <button onClick={clearTriggered} className="text-xs text-white/45 underline-offset-4 transition hover:text-white hover:underline">
          Clear {triggered.length} triggered alert{triggered.length === 1 ? "" : "s"}
        </button>
      )}

      <div className="flex items-start gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs leading-relaxed text-white/45">
        <BellOff size={14} className="mt-0.5 shrink-0 text-white/30" />
        <p>
          Alerts are stored in this browser and evaluated against real CoinGecko prices (via the SololevelingTrad backend)
          roughly once a minute while the app is open{authenticated ? "" : " — sign in on multiple devices to keep them in sync in a future release"}.
          Triggered alerts appear in the app and as a browser notification if you have granted permission.
        </p>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New price alert" desc="Thresholds are checked against live market data">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-white/60">Asset</span>
            {coin ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <CoinImg src={coin.image} symbol={coin.symbol} size="h-6 w-6" />
                <span className="flex-1 text-sm text-white">{coin.name} <span className="text-xs uppercase text-white/40">{coin.symbol}</span></span>
                <button type="button" onClick={() => setCoin(null)} className="text-xs text-white/40 hover:text-white">Change</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coins — name or symbol…" aria-label="Search asset" autoFocus />
                {searching && <p className="text-xs text-white/40">Searching…</p>}
                {!searching && results.length > 0 && (
                  <ul className="max-h-44 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/10 thin-scroll">
                    {results.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => { setCoin(c); setResults([]); setQ(""); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.05]">
                          <CoinImg src={c.image} symbol={c.symbol} size="h-6 w-6" />
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm text-white/85">{c.name}</span><span className="block text-[11px] uppercase text-white/40">{c.symbol}</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-white/60">Condition</span>
            <Segmented
              ariaLabel="Alert direction" value={direction} onChange={setDirection}
              items={[{ value: "above", label: "Rises above" }, { value: "below", label: "Falls below" }]}
            />
          </div>

          <FormField label="Target price (USD)">
            <Input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 100000" className="num" />
          </FormField>

          <FormField label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Why this level matters…" />
          </FormField>

          {formError && <p className="text-xs text-rose-400">{formError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm">Create alert</Button>
          </div>
        </form>
      </Modal>

      {permission === "denied" && (
        <p className="text-[11px] text-white/35">Browser notifications are blocked — you can still see triggers as in-app toasts.</p>
      )}
      {active.length > 0 && permission !== "granted" && (
        <p className="text-[11px] text-white/35">{active.length} active alert{active.length === 1 ? "" : "s"} — in-app toasts will notify you even without browser permission.</p>
      )}
    </div>
  );
}
