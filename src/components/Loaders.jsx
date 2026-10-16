import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";

export function PremiumLoader({ label = "Loading" }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-3 py-10" role="status" aria-label={label}>
      {reduce ? <Loader2 className="h-6 w-6 animate-spin text-blue-400" /> : (
        <motion.div className="relative h-12 w-12" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
          <span className="absolute inset-0 rounded-full border border-blue-500/20" />
          <span className="absolute inset-0 rounded-full border-t border-blue-400" />
          <motion.span className="absolute inset-3 rounded-full bg-blue-500/40 blur-[1px]" animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0.3, 0.8] }} transition={{ repeat: Infinity, duration: 1.6 }} />
        </motion.div>
      )}
      <p className="text-xs text-white/50">{label}…</p>
    </div>
  );
}
export function AuthLoader() { return <PremiumLoader label="Authenticating" />; }
export function PageLoader({ label = "Loading page" }) { return <div className="mx-auto max-w-6xl px-5 py-16"><PremiumLoader label={label} /></div>; }
export function PaymentLoader() {
  return (
    <div className="flex flex-col items-center gap-3 py-8" role="status" aria-label="Processing payment">
      <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      <p className="text-sm text-white">Processing payment…</p>
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full bg-blue-500" initial={{ x: "-100%" }} animate={{ x: "200%" }} transition={{ repeat: Infinity, duration: 1.2 }} style={{ width: "50%" }} />
      </div>
      <p className="text-[11px] text-white/40">Do not close this window. Waiting for confirmation.</p>
    </div>
  );
}
export function ButtonLoader() { return <Loader2 className="h-4 w-4 animate-spin" aria-hidden />; }
export function SkeletonLoader({ rows = 3 }) {
  return <div className="space-y-2 animate-pulse" aria-hidden>{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-10 rounded-xl border border-white/10 bg-white/5" />)}</div>;
}
