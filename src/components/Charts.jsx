import { useId } from "react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { chartSeries } from "../data/mockData.js";

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs backdrop-blur-md">
      <p className="text-white/50">{label}</p>
      {payload.map((p) => <p key={p.dataKey} className="text-white">{p.name}: {p.value}</p>)}
    </div>
  );
}

export function MarketChart({ data = chartSeries, height = 260 }) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="mcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="t" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} width={56} />
          <Tooltip content={<ChartTip />} />
          <Area type="monotone" dataKey="price" name="Price" stroke="#3b82f6" strokeWidth={2} fill="url(#mcFill)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={48}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <Bar dataKey="vol" name="Volume" fill="rgba(59,130,246,0.35)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ data = [], width = 96, height = 28, change = 0 }) {
  const up = (change ?? 0) >= 0;
  const color = up ? "#34d399" : "#fb7185";
  const gid = useId();
  if (!data.length) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const xy = data.map((v, i) => [(i / (data.length - 1)) * width, height - 3 - ((v - min) / range) * (height - 6)]);
  const pts = xy.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${pts} ${width},${height} 0,${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="1.8" fill={color} />
    </svg>
  );
}
