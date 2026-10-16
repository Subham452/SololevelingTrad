import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import { fmtUsd } from "../../lib/market.js";

// Defined once so React keeps a stable tooltip element (re-creating it every
// render causes the tooltip to flicker and lose its hover state).
function DepthTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const depth = p.bidDepth ?? p.askDepth;
  return (
    <div className="rounded-lg border border-white/12 bg-black/88 px-2.5 py-1.5 text-[11px] backdrop-blur-md">
      <p className="tabular-nums text-white">{fmtUsd(p.price)}</p>
      <p className="tabular-nums text-white/55">depth {depth?.toLocaleString()}</p>
    </div>
  );
}

/**
 * DepthChart — cumulative bid/ask depth from the paper venue's book.
 * Bids ascend on the left (green), asks descend on the right (red); the
 * mid-price reference line marks the spread. Clearly labeled simulated.
 */
export default function DepthChart({ book, height = 200 }) {
  const { points, mid, spread } = useMemo(() => {
    if (!book?.bids?.length || !book?.asks?.length) return { points: [], mid: null, spread: null };

    // Running-total depth built functionally (no accumulator mutation).
    const cumulate = (rows, key) => {
      let total = 0;
      return rows.map((r) => { total += r.qty; return { price: r.price, [key]: total }; });
    };
    const bids = cumulate(book.bids, "bidDepth");
    const asks = cumulate(book.asks, "askDepth");

    const all = [
      ...bids.map((b) => ({ ...b, side: "bid" })),
      ...asks.map((a) => ({ ...a, side: "ask" })),
    ].sort((x, y) => x.price - y.price);

    const bestBid = bids[0]?.price;
    const bestAsk = asks[0]?.price;
    return {
      points: all,
      mid: book.mid ?? (bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null),
      spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
    };
  }, [book]);

  if (!points.length) return <p className="py-10 text-center text-xs text-white/40">No depth data.</p>;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="bidFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="askFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="price" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
            tickLine={false} axisLine={false} minTickGap={44} tickFormatter={(v) => fmtUsd(v, 0)}
          />
          <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
          {mid != null && <ReferenceLine x={mid} stroke="rgba(34,211,238,0.6)" strokeDasharray="3 3" />}
          <Tooltip content={<DepthTip />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
          <Area type="stepAfter" dataKey="bidDepth" stroke="#10b981" strokeWidth={1.5} fill="url(#bidFill)" dot={false} isAnimationActive={false} />
          <Area type="stepAfter" dataKey="askDepth" stroke="#f43f5e" strokeWidth={1.5} fill="url(#askFill)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      {spread != null && (
        <p className="mt-1 text-center text-[10px] text-white/40">
          mid {fmtUsd(mid)} · spread {fmtUsd(spread)} · simulated book
        </p>
      )}
    </div>
  );
}
