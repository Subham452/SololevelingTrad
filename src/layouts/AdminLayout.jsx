// Admin Control Center app shell — collapsible sidebar, top bar with global
// search (⌘K command palette), notifications, and staff profile menu.
// Own layout (not MarketingLayout) so navigation, density, and typography are
// tuned for operations work.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, Bell, ChevronLeft, ChevronDown, Command, CreditCard, Gauge, HeartPulse,
  LayoutDashboard, LogOut, MessagesSquare, PhoneCall, Radio, Search, Shield,
  Users, Settings as SettingsIcon, ClipboardList, PanelLeft, Gem, AlertTriangle, Tags, Wallet,
} from "lucide-react";
import gsap from "gsap";
import { useAuth } from "../context/useAuth.js";
import { adminApi } from "../lib/admin.js";
import { cn } from "../lib/utils.js";
import { fmtDate } from "../components/admin/format.js";
import { useAdminGlow } from "../lib/glow.js";
import NeonGlowToggle from "../components/admin/NeonGlowToggle.jsx";

const SIDEBAR_KEY = "slt_admin_sidebar_collapsed";

// Sections mirror the Phase-4 information architecture. `perm` hides items the
// signed-in staff role cannot reach (server still enforces every route).
const NAV = [
  {
    label: "Executive",
    items: [
      { label: "Overview", to: "/admin", icon: LayoutDashboard, end: true },
      { label: "Analytics", to: "/admin/analytics", icon: Gauge },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Users", to: "/admin/users", icon: Users, perm: "users:read" },
      { label: "Pricing & Plans", to: "/admin/plans", icon: Tags, perm: "plans:read" },
      { label: "Transactions", to: "/admin/transactions", icon: CreditCard, perm: "finance:read" },
      { label: "Wallet & Deposits", to: "/admin/wallet", icon: Wallet, perm: "finance:read" },
      { label: "Subscriptions", to: "/admin/subscriptions", icon: ClipboardList },
      { label: "Messages", to: "/admin/messages", icon: MessagesSquare, perm: "messages:read" },
      { label: "Announcements", to: "/admin/announcements", icon: Bell },
    ],
  },
  {
    label: "Trust & Safety",
    items: [
      { label: "Activity log", to: "/admin/activity", icon: Activity },
      { label: "Security", to: "/admin/security", icon: Shield, perm: "security:read" },
      { label: "Calls & Live", to: "/admin/calls", icon: PhoneCall, perm: "calls:read" },
      { label: "Moderation", to: "/admin/moderation", icon: Radio, perm: "moderation:read" },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Health", to: "/admin/health", icon: HeartPulse },
      { label: "Settings", to: "/admin/settings", icon: SettingsIcon },
    ],
  },
];

// Permission lookup — mirrors backend/middleware/permissions.js so the UI can
// hide unreachable links. The server remains the source of truth.
const PERM = {
  "users:read": ["admin", "superadmin", "support", "analyst"],
  "plans:read": ["admin", "superadmin", "finance", "analyst"],
  "finance:read": ["admin", "superadmin", "finance", "analyst"],
  "messages:read": ["admin", "superadmin", "support"],
  "security:read": ["admin", "superadmin"],
  "calls:read": ["admin", "superadmin", "support"],
  "moderation:read": ["admin", "superadmin", "support"],
};

function can(role, permission) {
  if (role === "superadmin") return true;
  return (PERM[permission] || []).includes(role);
}

const TITLES = {
  "/admin": ["Overview", "Executive KPIs, revenue and platform activity"],
  "/admin/analytics": ["Analytics", "Registrations, revenue and conversion trends"],
  "/admin/users": ["Users", "Search, filter and manage user accounts"],
  "/admin/transactions": ["Transactions", "Payments, statuses and provider refunds"],
  "/admin/subscriptions": ["Subscriptions", "Plan mix, MRR and churn"],
  "/admin/plans": ["Pricing & Plans", "Create, price and publish subscription tiers"],
  "/admin/messages": ["Messages", "Support inbox — admin ↔ user conversations"],
  "/admin/activity": ["Activity log", "User and system events with filters"],
  "/admin/security": ["Security", "Login history, failed attempts and sessions"],
  "/admin/calls": ["Calls & Live", "Call records, live sessions and invitations"],
  "/admin/moderation": ["Moderation", "Reports queue and content actions"],
  "/admin/announcements": ["Announcements", "Publish and schedule platform notices"],
  "/admin/health": ["Health", "Database, process and provider status"],
  "/admin/settings": ["Settings", "Notifications and platform configuration"],
};

function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const flat = useMemo(() => NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))), []);
  const matches = useMemo(() => {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return q.trim() ? flat.filter((i) => rx.test(i.label)) : flat;
  }, [q, flat]);
  useEffect(() => { if (open) { setQ(""); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  const go = useCallback((item) => { navigate(item.to); onClose(); }, [navigate, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="glow-card relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/12 bg-[#0b0f1a] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4">
          <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && matches[0]) go(matches[0]);
            }}
            placeholder="Jump to a section…"
            className="w-full bg-transparent py-3.5 text-sm text-white placeholder:text-white/35 focus:outline-none"
            aria-label="Search sections"
          />
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">ESC</kbd>
        </div>
        <ul className="max-h-72 overflow-y-auto py-1.5">
          {matches.length === 0 && <li className="px-4 py-6 text-center text-xs text-white/40">No matching section</li>}
          {matches.map((m, i) => (
            <li key={m.to}>
              <button
                type="button"
                onClick={() => go(m)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition",
                  i === 0 ? "bg-white/[0.06] text-white" : "text-white/70 hover:bg-white/[0.04] hover:text-white",
                )}
              >
                <m.icon className="h-4 w-4 shrink-0 text-cyan-300/80" aria-hidden />
                <span className="flex-1 truncate">{m.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-white/30">{m.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function NotificationCenter({ open, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!open) return undefined;
    setLoading(true); setErr("");
    adminApi.audit({ limit: 8 })
      .then((d) => setItems(d?.items || []))
      .catch((e) => setErr(e?.message || "Failed to load notifications"))
      .finally(() => setLoading(false));
    return undefined;
  }, [open]);
  if (!open) return null;
  return (
    <div className="glow-card absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-white/12 bg-[#0b0f1a] shadow-2xl" role="region" aria-label="Notifications">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Recent admin activity</p>
        <button type="button" onClick={onClose} aria-label="Close notifications" className="text-white/40 hover:text-white">✕</button>
      </div>
      <div className="max-h-80 overflow-y-auto thin-scroll">
        {loading && <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />)}</div>}
        {!loading && err && <p className="p-4 text-xs text-rose-400">{err}</p>}
        {!loading && !err && items.length === 0 && <p className="p-4 text-xs text-white/40">No recent activity.</p>}
        {!loading && !err && items.map((a) => (
          <div key={a._id} className="border-b border-white/[0.06] px-4 py-2.5 last:border-0">
            <p className="text-xs text-white/75"><span className="font-medium text-cyan-300">{a.action}</span></p>
            <p className="mt-0.5 text-[11px] text-white/40">
              {a.actorId?.email || "system"} · {fmtDate(a.createdAt)}
            </p>
          </div>
        ))}
      </div>
      <Link to="/admin/activity" onClick={onClose} className="block border-t border-white/10 px-4 py-2.5 text-center text-xs text-cyan-300 hover:bg-white/[0.04]">
        View full activity log
      </Link>
    </div>
  );
}

function ProfileMenu({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!open) return null;
  return (
    <div className="glow-card absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl border border-white/12 bg-[#0b0f1a] shadow-2xl" role="menu" aria-label="Profile">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="truncate text-sm font-medium text-white">{user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.email}</p>
        <p className="mt-0.5 truncate text-xs text-white/45">{user?.email}</p>
        <p className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-300">
          {user?.role || "staff"}
        </p>
      </div>
      <Link to="/dashboard" onClick={onClose} className="block px-4 py-2.5 text-sm text-white/70 hover:bg-white/[0.04] hover:text-white" role="menuitem">
        Open trader dashboard
      </Link>
      <button
        type="button" role="menuitem"
        onClick={async () => { onClose(); await logout(); navigate("/"); }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-300 hover:bg-rose-500/10"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

function HealthDot() {
  const [state, setState] = useState("checking");
  const [tip, setTip] = useState("");
  useEffect(() => {
    let alive = true;
    const check = () => adminApi.health()
      .then((d) => { if (!alive) return; setState(d?.status === "healthy" ? "ok" : "warn"); setTip(`Uptime ${Math.round((d?.uptimeSec || 0) / 60)}m · DB ${d?.db?.state || "?"}`); })
      .catch(() => { if (alive) { setState("down"); setTip("Backend unreachable"); } });
    check();
    const t = setInterval(check, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const tone = state === "ok" ? "bg-emerald-400" : state === "warn" ? "bg-amber-400" : state === "down" ? "bg-rose-400" : "bg-white/30";
  return (
    <span className="group/hd relative inline-flex items-center gap-1.5 text-[11px] text-white/45" title={tip}>
      <span className={cn("h-2 w-2 rounded-full", tone, state === "checking" && "animate-pulse")} aria-hidden />
      <span className="sr-only">System health: {state}</span>
      <span className="hidden sm:inline">{state === "ok" ? "Operational" : state === "warn" ? "Degraded" : state === "down" ? "Down" : "Checking…"}</span>
    </span>
  );
}

export default function AdminLayout() {
  const { user, isStaff, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === "1");
  const [drawer, setDrawer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const glow = useAdminGlow();
  const ambientRef = useRef(null);

  // Ambient glow drift: a single transform-only tween (GSAP is already a
  // dependency — same approach as AtmosphericBackground). Restarts when the
  // preference flips and is skipped entirely for reduced-motion users, so it
  // costs nothing when disabled and never triggers layout.
  useEffect(() => {
    if (!glow) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const el = ambientRef.current;
    if (!el) return undefined;
    const tween = gsap.fromTo(
      el,
      { xPercent: -1.2, yPercent: -0.8 },
      { xPercent: 1.2, yPercent: 0.8, duration: 26, ease: "sine.inOut", yoyo: true, repeat: -1 },
    );
    return () => tween.kill();
  }, [glow]);

  const role = user?.role || "user";
  const title = TITLES[location.pathname] || ["Admin", "Control center"];

  const toggle = () => setCollapsed((c) => { localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1"); return !c; });

  // ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close transient menus on navigation.
  useEffect(() => { setDrawer(false); setNotifOpen(false); setProfileOpen(false); }, [location.pathname]);

  if (loading) return <div className="min-h-screen bg-[#070a12]" />;
  if (!isStaff) { navigate("/", { replace: true }); return null; }

  const visible = (item) => !item.perm || can(role, item.perm);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2.5 px-4 pt-5 pb-4", collapsed && "justify-center px-2")}>
        <Link to="/admin" className="flex min-w-0 items-center gap-2.5">
          <span className="glow-logo flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-black">
            <Gem className="h-4 w-4" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold tracking-tight text-white">Control Center</span>
              <span className="block text-[10px] uppercase tracking-[0.16em] text-white/35">SololevelingTrad</span>
            </span>
          )}
        </Link>
      </div>
      <nav className="thin-scroll flex-1 space-y-5 overflow-y-auto px-2.5 pb-4" aria-label="Admin">
        {NAV.map((group) => {
          const items = group.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={group.label}>
              {!collapsed && <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{group.label}</p>}
              {collapsed && <div className="mx-auto mb-2 h-px w-6 bg-white/10" />}
              <div className="space-y-0.5">
                {items.map((it) => (
                  <NavLink
                    key={it.to} to={it.to} end={it.end}
                    className={({ isActive }) => cn(
                      "nav-glow flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                      collapsed && "justify-center px-2",
                      isActive ? "glow-active bg-cyan-400/10 text-cyan-200" : "text-white/60 hover:bg-white/[0.04] hover:text-white",
                    )}
                    title={collapsed ? it.label : undefined}
                  >
                    <it.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{it.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/[0.07] p-2.5">
        <button
          onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("hidden w-full items-center gap-3 rounded-lg py-2 text-xs text-white/45 transition hover:bg-white/[0.04] hover:text-white md:flex", collapsed ? "justify-center px-2" : "px-3")}
        >
          {collapsed ? <ChevronLeft className="h-4 w-4 rotate-180" /> : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
        </button>
        <Link to="/" className={cn("mt-0.5 flex items-center gap-3 rounded-lg py-2 text-xs text-white/45 transition hover:bg-white/[0.04] hover:text-white", collapsed ? "justify-center px-2" : "px-3")}>
          <PanelLeft className="h-4 w-4" />
          {!collapsed && <span>Back to app</span>}
        </Link>
      </div>
    </div>
  );

  return (
    <div
      className="admin-shell font-admin relative isolate min-h-screen bg-[#070a12] text-white antialiased"
      data-glow={glow ? "on" : "off"}
    >
      {/* Decorative ambient wash — never intercepts pointer events. */}
      <div className="glow-ambient" aria-hidden="true">
        <div ref={ambientRef} className="glow-ambient__drift" />
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {/* Sidebar (desktop) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-white/10 bg-[#0a0d16] transition-[width] duration-200 md:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {sidebar}
      </aside>

      {/* Sidebar (mobile drawer) */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-white/10 bg-[#0a0d16]">{sidebar}</div>
        </div>
      )}

      <div className={cn("transition-[padding] duration-200", collapsed ? "md:pl-16" : "md:pl-60")}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070a12]/90 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button" onClick={() => setDrawer(true)} aria-label="Open navigation"
              className="glow-btn-sec inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white md:hidden"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="glow-section truncate text-sm font-semibold text-white">{title[0]}</h2>
              <p className="hidden truncate text-xs text-white/40 sm:block">{title[1]}</p>
            </div>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="glow-btn-sec hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/45 transition hover:border-white/25 hover:text-white/80 sm:flex"
              aria-label="Open command palette"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Jump to…</span>
              <kbd className="ml-2 flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px]">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </button>

            <div className="hidden lg:block"><HealthDot /></div>

            <NeonGlowToggle />

            <div className="relative">
              <button
                type="button"
                onClick={() => { setNotifOpen((o) => !o); setProfileOpen(false); }}
                aria-label="Notifications" aria-expanded={notifOpen}
                className="glow-btn-sec inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60 transition hover:text-white"
              >
                <Bell className="h-4 w-4" />
              </button>
              <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => { setProfileOpen((o) => !o); setNotifOpen(false); }}
                aria-expanded={profileOpen} aria-label="Profile menu"
                className="glow-btn-sec flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-2 pr-2.5 text-xs text-white/70 transition hover:text-white"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/80 to-violet-500/80 text-[10px] font-bold text-black">
                  {(user?.firstName || user?.email || "?").charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[10rem] truncate sm:block">{user?.firstName || user?.email}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>

        <footer className="mx-auto w-full max-w-[1440px] px-4 pb-8 sm:px-6 lg:px-8">
          <p className="flex items-center gap-2 border-t border-white/[0.07] pt-4 text-[11px] text-white/30">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Admin actions are logged. Financial figures are computed from live payment records — refunds are executed by the payment provider.
          </p>
        </footer>
      </div>
    </div>
  );
}
