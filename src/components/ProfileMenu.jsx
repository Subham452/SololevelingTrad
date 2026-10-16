import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, ChevronDown, LayoutDashboard, LogOut, Receipt, Settings, ShieldCheck, User, Wallet, CreditCard, Users, Bot } from "lucide-react";
import { useAuth } from "../context/useAuth.js";
import { resolveAvatar } from "../lib/profile.js";
import { cn } from "../lib/utils.js";

const items = [
  { to: "/account", label: "Profile", desc: "Overview & rank", icon: User },
  { to: "/account", label: "Edit profile", desc: "Name, bio, avatar", icon: BadgeCheck, tab: "edit" },
  { to: "/dashboard", label: "Dashboard", desc: "Trading workspace", icon: LayoutDashboard },
  { to: "/portfolio", label: "Portfolio", desc: "Holdings & P/L", icon: Wallet },
  { to: "/wallet", label: "Wallet", desc: "Balances & ledger", icon: Wallet },
  { to: "/subscription", label: "Subscription", desc: "Plan & billing", icon: CreditCard },
  { to: "/community", label: "Community", desc: "Groups & chat", icon: Users },
  { to: "/algo-trading", label: "Algo Trading", desc: "Automated strategies", icon: Bot },
  { to: "/purchases", label: "Purchases", desc: "Orders & invoices", icon: Receipt },
  { to: "/account", label: "Security", desc: "Password & sessions", icon: ShieldCheck, tab: "security" },
  { to: "/account", label: "Settings", desc: "Notifications & privacy", icon: Settings, tab: "settings" },
];

export default function ProfileMenu({ align = "right" }) {
  const { user, authenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  const rm = useReducedMotion();

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  if (!authenticated || !user) return null;

  const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || "Hunter";
  const src = resolveAvatar(user.avatar);
  const initials = name.slice(0, 2).toUpperCase();

  const go = (to, tab) => { setOpen(false); nav(to + (tab ? `?tab=${tab}` : "")); };
  const out = async () => { setOpen(false); await logout(); nav("/"); };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-white/5 p-1 pr-1.5 transition hover:border-violet-400/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-600/60 to-cyan-500/40 text-[11px] font-bold text-white">
          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
        </span>
        <ChevronDown size={14} className={cn("text-white/60 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Profile"
            initial={rm ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            animate={rm ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={rm ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={cn(
              "absolute top-11 z-[90] w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0a1a]/95 shadow-2xl shadow-violet-950/50 backdrop-blur-xl",
              align === "right" ? "right-0" : "left-0"
            )}
          >
            <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-br from-violet-600/20 to-cyan-500/10 p-4">
              <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-violet-600/60 to-cyan-500/40 text-sm font-bold">
                {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{name}</p>
                <p className="truncate text-xs text-white/50">{user.email}</p>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {items.map(({ to, label, desc, icon: Icon, tab }, i) => (
                <motion.button
                  key={label}
                  role="menuitem"
                  onClick={() => go(to, tab)}
                  initial={rm ? {} : { opacity: 0, x: -8 }}
                  animate={rm ? {} : { opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * i, duration: 0.15 }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-violet-300">
                    <Icon size={15} />
                  </span>
                  <span>
                    <span className="block text-sm text-white/85">{label}</span>
                    <span className="block text-[11px] text-white/40">{desc}</span>
                  </span>
                </motion.button>
              ))}
            </div>
            <div className="border-t border-white/10 p-1.5">
              <button
                role="menuitem"
                onClick={out}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-300 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10">
                  <LogOut size={15} />
                </span>
                Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

