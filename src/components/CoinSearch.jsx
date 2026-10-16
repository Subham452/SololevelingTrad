import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { marketApi, fmtUsd, fmtPct } from "../lib/market.js";
import { recordView, useRecent } from "../lib/recent.js";
import { cn } from "../lib/utils.js";

// Debounced search with keyboard nav, stale-request guard, recent history.
export default function CoinSearch({ className, autoFocus }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hi, setHi] = useState(0);
  const recent = useRecent();
  const seq = useRef(0);
  const nav = useNavigate();
  const box = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setError(""); setLoading(false); return; }
    setLoading(true);
    const id = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const d = await marketApi.search(q.trim());
        if (seq.current !== id) return; // stale guard
        setResults(d?.results || []);
        setError("");
      } catch (e) { if (seq.current === id) setError(e?.message || "Search failed"); }
      finally { if (seq.current === id) setLoading(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (c) => {
    recordView(c);
    setOpen(false); setQ("");
    nav(`/markets/${encodeURIComponent(c.id)}`);
  };

  const list = q.trim().length >= 2 ? results : recent;
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && list[hi]) go(list[hi]);
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={box} className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
      <input
        value={q} autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)} onKeyDown={onKey}
        placeholder="Search coins — name or symbol…"
        role="combobox" aria-expanded={open} aria-label="Search cryptocurrencies" aria-autocomplete="list"
        className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      {open && (q.trim().length >= 2 || recent.length > 0) && (
        <div role="listbox" className="absolute left-0 right-0 top-11 z-[90] overflow-hidden rounded-2xl border border-white/10 bg-[#0d0a1a]/95 shadow-2xl backdrop-blur-xl">
          {q.trim().length < 2 && <p className="px-4 pb-1 pt-3 text-[11px] uppercase tracking-widest text-white/35">Recently viewed</p>}
          {loading && <p className="px-4 py-4 text-xs text-white/50">Searching…</p>}
          {!loading && error && <p className="px-4 py-4 text-xs text-red-400">{error}</p>}
          {!loading && !error && q.trim().length >= 2 && results.length === 0 && <p className="px-4 py-4 text-xs text-white/50">No results for “{q.trim()}”.</p>}
          {!loading && !error && list.map((c, i) => (
            <button
              key={c.id} role="option" aria-selected={i === hi}
              onMouseEnter={() => setHi(i)} onClick={() => go(c)}
              className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left transition", i === hi ? "bg-white/10" : "hover:bg-white/5")}
            >
              {c.image ? <img src={c.image} alt="" className="h-6 w-6 rounded-full" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">{String(c.symbol || "?").slice(0, 2)}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white/85">{c.name}</span>
                <span className="block text-[11px] uppercase text-white/40">{c.symbol}</span>
              </span>
              {c.price !== undefined && <span className="text-xs text-white/70">{fmtUsd(c.price)}</span>}
              {c.change24h !== undefined && c.change24h !== null && <span className={cn("text-xs", c.change24h >= 0 ? "text-green-400" : "text-red-400")}>{fmtPct(c.change24h)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
