import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { navLinks } from "../data/mockData.js";
import { cn } from "../lib/utils.js";
import { useAuth } from "../context/useAuth.js";
import ProfileMenu from "./ProfileMenu.jsx";
import Notifications from "./Notifications.jsx";
import { BrandMark, BrandWordmark } from "./Brand.jsx";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { authenticated } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50 transition-all", scrolled ? "border-b border-white/10 bg-black/70 backdrop-blur-md" : "bg-transparent")}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" aria-label="SololevelingTrad home">
          <BrandMark size={30} />
          <BrandWordmark />
        </Link>
        <div className="hidden items-center gap-6 md:flex">
          {navLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => cn("relative py-1 text-sm text-white/60 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400", isActive && "text-white")}>
              {({ isActive }) => (<>
                {l.label}
                <span className={cn("absolute inset-x-0 -bottom-0.5 h-px origin-left bg-gradient-to-r from-cyan-400 to-violet-500 transition-transform duration-300", isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100")} aria-hidden />
              </>)}
            </NavLink>
          ))}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          {authenticated ? (
            <>
              <Link to="/dashboard" className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">Open dashboard</Link>
              <Notifications />
              <ProfileMenu />
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-full px-3 py-2 text-sm text-white/60 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">Sign In</Link>
              <Link to="/register" className="rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-semibold text-black shadow-[0_4px_20px_rgba(77,235,255,0.3)] transition hover:shadow-[0_4px_28px_rgba(77,235,255,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Get Started</Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 md:hidden">
          {authenticated && <ProfileMenu />}
          <button className="text-white" onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-b border-white/10 bg-black/90 backdrop-blur-md md:hidden">
            <div className="space-y-1 px-4 py-4">
              {navLinks.map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => cn("block rounded-lg px-3 py-2 text-sm text-white/70", isActive && "bg-white/5 text-white")}>{l.label}</NavLink>
              ))}
              {authenticated ? (
                <div className="flex gap-3 pt-2">
                  <Link to="/dashboard" className="flex-1 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 text-center text-sm font-semibold text-black">Open dashboard</Link>
                  <Link to="/account" className="flex-1 rounded-full border border-white/15 px-4 py-2 text-center text-sm text-white">Profile</Link>
                </div>
              ) : (
                <div className="flex gap-3 pt-2">
                  <Link to="/login" className="flex-1 rounded-full border border-white/15 px-4 py-2 text-center text-sm text-white">Sign In</Link>
                  <Link to="/register" className="flex-1 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 text-center text-sm font-semibold text-black">Get Started</Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
