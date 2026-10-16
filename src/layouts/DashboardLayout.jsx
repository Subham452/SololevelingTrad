import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeftRight, BellRing, ChevronsLeft, ChevronsRight, Crown, LayoutDashboard, LineChart,
  ListOrdered, Menu, Newspaper, PanelLeft, PieChart, Radio, ReceiptText, SlidersHorizontal,
  Star, UserCog, Users, Wallet, X, Gem,
} from "lucide-react";
import AtmosphericBackground from "../components/AtmosphericBackground.jsx";
import ProfileMenu from "../components/ProfileMenu.jsx";
import Notifications from "../components/Notifications.jsx";
import CoinSearch from "../components/CoinSearch.jsx";
import { Brand, BrandMark } from "../components/Brand.jsx";
import { useAuth } from "../context/useAuth.js";
import { useAlertsEngine, useAlertToasts } from "../lib/alerts.js";
import { fmtUsd } from "../lib/market.js";
import { cn } from "../lib/utils.js";

const SIDEBAR_KEY = "slt_sidebar_collapsed";

/** Central navigation config — single source for sidebar + drawer + titles. */
const NAV = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
      { label: "Markets", to: "/markets", icon: LineChart },
      { label: "Watchlist", to: "/watchlist", icon: Star },
      { label: "News & Activity", to: "/news", icon: Newspaper },
    ],
  },
  {
    label: "Trading",
    items: [
      { label: "Trade", to: "/trade", icon: ArrowLeftRight },
      { label: "Portfolio", to: "/portfolio", icon: PieChart },
      { label: "Orders", to: "/orders", icon: ListOrdered },
      { label: "Wallet", to: "/wallet", icon: Wallet },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Signals", to: "/signals", icon: SlidersHorizontal },
      { label: "Alerts", to: "/alerts", icon: BellRing },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", to: "/account", icon: UserCog },
      { label: "Subscription", to: "/subscription", icon: Crown },
      { label: "Billing & Orders", to: "/checkout/orders", icon: ReceiptText },
      { label: "Community", to: "/community", icon: Users },
      { label: "Live Sessions", to: "/live", icon: Radio },
    ],
  },
];

const TITLES = {
  "/dashboard": ["Dashboard", "Your market command centre"],
  "/markets": ["Markets", "Live prices across supported assets"],
  "/watchlist": ["Watchlist", "Assets you are tracking"],
  "/news": ["News & Activity", "Real market movement, attributed"],
  "/trade": ["Trade", "Simulated paper-trading terminal"],
  "/orders": ["Orders", "Open orders and execution history"],
  "/portfolio": ["Portfolio", "Simulated holdings and performance"],
  "/wallet": ["Wallet", "Real funds, deposits and paper balances"],
  "/wallet/transactions": ["Transactions", "Real-money ledger and history"],
  "/wallet/add": ["Add money", "Deposit real funds"],
  "/signals": ["Signals", "Preview — demo analysis, not live advice"],
  "/alerts": ["Price alerts", "Evaluated against live prices while the app is open"],
  "/account": ["Account", "Profile, security and preferences"],
  "/subscription": ["Subscription", "Plan and billing"],
  "/checkout": ["Checkout", "Secure order review and payment"],
  "/community": ["Community", "Groups and discussions"],
  "/live": ["Live sessions", "Broadcasts and rooms"],
};

function titleFor(path) {
  const base = "/" + (path.split("/")[1] || "");
  return TITLES[base] || ["SololevelingTrad", ""];
}

function NavItem({ item, collapsed, onNavigate }) {
  const { label, to, icon: Icon, end } = item;
  return (
    <NavLink
      to={to} end={end} onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
          collapsed ? "justify-center px-2" : "px-3",
          isActive ? "bg-white/[0.07] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={collapsed ? "nav-ind-collapsed" : "nav-ind"}
              className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-cyan-400 to-violet-500"
              transition={{ duration: 0.22, ease: "easeOut" }}
            />
          )}
          <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", isActive ? "text-cyan-300" : "text-white/45 group-hover:text-white/80")} />
          {!collapsed && <span className="truncate">{label}</span>}
          {collapsed && (
            <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-white/10 bg-[#0b0f1a] px-2 py-1 text-xs text-white/85 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ collapsed, onToggle, onNavigate }) {
  const { isStaff } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2.5 px-4 pt-5 pb-4", collapsed && "justify-center px-2")}>
        <Brand collapsed={collapsed} to="/dashboard" />
      </div>
      <nav className="thin-scroll flex-1 space-y-5 overflow-y-auto px-2.5 pb-4" aria-label="Application">
        {NAV.map((group) => (
          <div key={group.label}>
            {!collapsed && <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{group.label}</p>}
            {collapsed && <div className="mx-auto mb-2 h-px w-6 bg-white/10" />}
            <div className="space-y-0.5">
              {group.items.map((it) => <NavItem key={it.to} item={it} collapsed={collapsed} onNavigate={onNavigate} />)}
            </div>
          </div>
        ))}
        {isStaff && (
          <div>
            {!collapsed && <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Admin</p>}
            <div className="space-y-0.5">
              <NavItem item={{ label: "Control Center", to: "/admin", icon: Gem }} collapsed={collapsed} onNavigate={onNavigate} />
            </div>
          </div>
        )}
      </nav>
      <div className="border-t border-white/[0.07] p-2.5">
        <button
          onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("hidden w-full items-center gap-3 rounded-lg py-2 text-xs text-white/45 transition hover:bg-white/[0.04] hover:text-white md:flex", collapsed ? "justify-center px-2" : "px-3")}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /><span>Collapse</span></>}
        </button>
        <Link to="/" onClick={onNavigate} className={cn("mt-0.5 flex items-center gap-3 rounded-lg py-2 text-xs text-white/45 transition hover:bg-white/[0.04] hover:text-white", collapsed ? "justify-center px-2" : "px-3")}>
          <PanelLeft className="h-4 w-4" />
          {!collapsed && <span>Marketing site</span>}
        </Link>
      </div>
    </div>
  );
}

function AlertToasts() {
  const { toasts, dismiss } = useAlertToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.tid}
            initial={{ opacity: 0, x: 24, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-cyan-500/30 bg-[#0a1220]/95 p-3.5 shadow-2xl backdrop-blur-xl"
            role="alert"
          >
            <span className="mt-0.5 rounded-full bg-cyan-500/15 p-1.5"><BellRing className="h-3.5 w-3.5 text-cyan-300" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white">Price alert · {t.symbol}</p>
              <p className="mt-0.5 text-xs text-white/60">
                {t.name} moved {t.direction} {fmtUsd(t.price)} — now <span className="num text-white">{fmtUsd(t.triggerPrice)}</span>
              </p>
              <Link to={`/markets/${encodeURIComponent(t.coinId)}`} onClick={() => dismiss(t.tid)} className="mt-1 inline-block text-[11px] font-medium text-cyan-300 hover:text-cyan-200">
                View asset →
              </Link>
            </div>
            <button onClick={() => dismiss(t.tid)} aria-label="Dismiss alert" className="rounded p-1 text-white/40 hover:text-white"><X className="h-3.5 w-3.5" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function DashboardLayout() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; }
  });
  const [drawer, setDrawer] = useState(false);
  const [title, subtitle] = titleFor(location.pathname);

  useAlertsEngine();

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  // Close the mobile drawer on navigation and Escape; lock scroll while open.
  useEffect(() => { setDrawer(false); }, [location.pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setDrawer(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawer]);

  return (
    <div className="min-h-screen text-white">
      <AtmosphericBackground />
      <a href="#app-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-lg focus:bg-[#0b0f1a] focus:px-4 focus:py-2 focus:text-sm">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-white/[0.08] bg-[#070a12]/80 backdrop-blur-xl transition-[width] duration-200 md:block",
          collapsed ? "w-[72px]" : "w-60"
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" aria-hidden
            />
            <motion.aside
              initial={reduce ? { opacity: 0 } : { x: "-100%" }} animate={reduce ? { opacity: 1 } : { x: 0 }} exit={reduce ? { opacity: 0 } : { x: "-100%" }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="fixed inset-y-0 left-0 z-50 w-[264px] border-r border-white/[0.08] bg-[#070a12]/95 backdrop-blur-xl md:hidden"
              role="dialog" aria-label="Navigation menu"
            >
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-1.5 text-white/50 hover:text-white">
                <X className="h-5 w-5" />
              </button>
              <SidebarContent collapsed={false} onToggle={() => {}} onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Content column */}
      <div className={cn("transition-[padding] duration-200", collapsed ? "md:pl-[72px]" : "md:pl-60")}>
        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#05070d]/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-white/60 hover:text-white md:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/dashboard" className="md:hidden" aria-label="Dashboard"><BrandMark size={26} /></Link>
            <div className="min-w-0">
              <h1 className="truncate font-display text-[15px] font-bold tracking-tight text-white">{title}</h1>
              {subtitle && <p className="hidden truncate text-[11px] text-white/40 sm:block">{subtitle}</p>}
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <CoinSearch className="hidden w-56 lg:block xl:w-72" />
              <Notifications />
              <ProfileMenu />
            </div>
          </div>
          <div className="px-4 pb-3 sm:px-6 lg:hidden">
            <CoinSearch />
          </div>
        </header>

        <main id="app-main" className="mx-auto w-full max-w-[1440px] px-4 pb-14 pt-5 sm:px-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AlertToasts />
    </div>
  );
}
