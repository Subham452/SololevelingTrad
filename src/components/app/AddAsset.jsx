import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { marketApi } from "../../lib/market.js";
import CoinImg from "./CoinImg.jsx";
import { cn } from "../../lib/utils.js";

/**
 * Compact asset picker popover — debounced search over the backend market
 * search endpoint. `onSelect(coin)` decides what happens (add to watchlist,
 * create alert…). `selectedIds` greys out assets already chosen.
 */
export default function AddAsset({ onSelect, selectedIds = [], label = "Add", className }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const box = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setError(""); setLoading(false); return; }
    setLoading(true);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const d = await marketApi.search(q.trim());
        if (seq.current !== id) return;
        setResults(d?.results || []); setError("");
      } catch (e) { if (seq.current === id) setError(e?.message || "Search failed"); }
      finally { if (seq.current === id) setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`${label} asset`}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:border-cyan-500/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        <Plus size={12} /> {label}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-[90] w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1a]/97 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
            <Search size={13} className="shrink-0 text-white/30" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coins…"
              aria-label="Search assets to add"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto thin-scroll">
            {loading && <p className="px-4 py-3 text-xs text-white/50">Searching…</p>}
            {!loading && error && <p className="px-4 py-3 text-xs text-rose-400">{error}</p>}
            {!loading && !error && q.trim().length < 2 && <p className="px-4 py-3 text-xs text-white/40">Type at least 2 characters.</p>}
            {!loading && !error && q.trim().length >= 2 && results.length === 0 && <p className="px-4 py-3 text-xs text-white/40">No results.</p>}
            {!loading && !error && results.map((c) => {
              const added = selectedIds.includes(c.id);
              return (
                <button
                  key={c.id} type="button" disabled={added}
                  onClick={() => { onSelect(c); setOpen(false); setQ(""); }}
                  className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left transition", added ? "opacity-50" : "hover:bg-white/[0.05]")}
                >
                  <CoinImg src={c.image} symbol={c.symbol} size="h-6 w-6" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white/85">{c.name}</span>
                    <span className="block text-[11px] uppercase text-white/40">{c.symbol}</span>
                  </span>
                  {added ? <Check size={14} className="text-emerald-400" /> : <Plus size={14} className="text-white/40" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
