import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../lib/utils.js";

/**
 * Accessible dialog: portal + backdrop, Escape to close, scroll lock,
 * reduced-motion aware. `open` toggles, `onClose` fires on dismiss.
 */
export default function Modal({ open, onClose, title, desc, children, className, width = "max-w-md" }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-hidden
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn("relative w-full rounded-2xl border border-white/10 bg-[#0a0e18]/97 shadow-2xl backdrop-blur-xl", width, className)}
          >
            <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">{title}</h2>
                {desc && <p className="mt-0.5 text-xs text-white/45">{desc}</p>}
              </div>
              <button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1 text-white/40 transition hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="px-5 py-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
