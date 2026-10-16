import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { fmtUsd } from "../../lib/market.js";

// Colorblind-conscious palette (Okabe-Ito derived) with neon accents.
const COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb7185", "#4ade80"];

/**
 * AllocationDonut — segments sized by real market value. Hover expands the
 * slice; center shows the total. Renders a legend keyed to segment colors.
 */
export default function AllocationDonut({ holdings = [], total = 0, height = 220 }) {
  const [active, setActive] = useState(null);
  const data = holdings
    .filter((h) => (h.available + h.reserved) > 0 && h.value > 0)
    .map((h) => ({ name: h.asset, value: h.value }))
    .sort((a, b) => b.value - a.value);

  if (!data.length) return <p className="py-10 text-center text-xs text-white/40">No allocations to chart.</p>;
  const t = total || data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%"
              paddingAngle={2} stroke="none" onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]}
                  opacity={active == null || active === i ? 1 : 0.4}
                  style={{ filter: active === i ? "drop-shadow(0 0 10px rgba(34,211,238,0.6))" : "none", transition: "opacity .2s" }} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#0d0a1a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 12 }}
              formatter={(v, n) => [fmtUsd(v, 0), n]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-widest text-white/40">{active != null ? data[active].name : "Total"}</span>
          <span className="text-lg font-semibold tabular-nums text-white">{fmtUsd(active != null ? data[active].value : t, 0)}</span>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-1">
        {data.map((d, i) => (
          <motion.li key={d.name} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
            className="flex items-center gap-2 text-white/65">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="w-12">{d.name}</span>
            <span className="tabular-nums text-white/45">{((d.value / t) * 100).toFixed(1)}%</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
