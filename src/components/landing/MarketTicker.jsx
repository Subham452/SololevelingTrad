import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { fmtUsd, fmtPct } from "../../lib/market.js";
import { cn } from "../../lib/utils.js";

// Full-width live ticker. Real data only; CSS animation, pause on hover,
// reduced-motion safe, decorative duplicates hidden from screen readers.
export default function MarketTicker({ coins }) {
  const items = (coins || []).slice(0, 10);
  if (!items.length) return null;
  const row = (hidden) => (
    <div aria-hidden={hidden} className="flex shrink-0 items-center">
      {items.map((c) => {
        const up = (c.change24h ?? 0) >= 0;
        return (
          <Link
            key={c.id + (hidden ? "-b" : "-a")}
            to={`/markets/${encodeURIComponent(c.id)}`}
            tabIndex={hidden ? -1 : 0}
            className="mx-5 flex items-center gap-2 text-xs tabular-nums text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <span className="font-semibold uppercase text-white/85">{c.symbol}</span>
            <span>{fmtUsd(c.price, c.price < 10 ? 2 : 0)}</span>
            <span className={cn("inline-flex items-center gap-0.5", up ? "text-emerald-400" : "text-red-400")}>
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {fmtPct(c.change24h)}
            </span>
          </Link>
        );
      })}
    </div>
  );
  return (
    <div className="overflow-hidden border-y border-white/[0.07] bg-[#0D1220]/60 py-2.5">
      <div className="slt-ticker flex w-max motion-safe:animate-[slt-scroll_40s_linear_infinite] motion-reduce:animate-none hover:[animation-play-state:paused]">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
