import { Link } from "react-router-dom";
import { LineChart, Radar, Wallet, MessagesSquare, Video, Radio } from "lucide-react";
import { Container, SectionHeading, Reveal } from "../ui.jsx";

// Bento grid of REAL capabilities only — every card routes to a working page.
const FEATURES = [
  {
    icon: LineChart, to: "/terminal", span: "md:col-span-2",
    title: "Pro terminal & charting",
    copy: "Candles, OHLC, depth, volume and indicators (SMA, EMA, RSI, MACD, Bollinger, VWAP) on real market data.",
    glow: "from-cyan-400/15",
  },
  {
    icon: Radar, to: "/markets",
    title: "Real-time market tracking",
    copy: "Live prices, heatmaps and 24h movers across top assets.",
    glow: "from-blue-500/15",
  },
  {
    icon: Wallet, to: "/portfolio",
    title: "Watchlists & portfolio",
    copy: "Track favorites and paper-trade with a simulated $100k book.",
    glow: "from-violet-500/15",
  },
  {
    icon: MessagesSquare, to: "/community",
    title: "Trader community",
    copy: "Discuss setups in real conversations with other traders.",
    glow: "from-fuchsia-500/10",
  },
  {
    icon: Video, to: "/rooms",
    title: "Audio & video rooms",
    copy: "Spin up secure meeting rooms with waiting rooms and invites.",
    glow: "from-cyan-400/10",
  },
  {
    icon: Radio, to: "/live", span: "md:col-span-2",
    title: "Live sessions",
    copy: "Host or join live market broadcasts with audience chat, questions and moderation.",
    glow: "from-blue-500/10",
  },
];

export default function FeatureBento() {
  return (
    <Container>
      <Reveal>
        <SectionHeading
          eyebrow="Platform"
          title="One workspace for the whole trade"
          desc="Everything below is implemented and working — open any card to use it."
        />
      </Reveal>
      <div className="grid gap-4 md:grid-cols-4">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 4) * 0.06} className={f.span || ""}>
            <Link
              to={f.to}
              className="group relative block h-full overflow-hidden rounded-3xl border border-white/10 bg-[#0D1220]/70 p-6 transition duration-300 hover:-translate-y-1 hover:border-cyan-400/25 hover:shadow-[0_16px_50px_rgba(82,120,255,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${f.glow} to-transparent opacity-0 transition duration-300 group-hover:opacity-100`} />
              <f.icon className="h-6 w-6 text-cyan-300" aria-hidden />
              <h3 className="mt-4 font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{f.copy}</p>
              <span className="mt-4 inline-block text-xs font-medium text-cyan-300 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                Open →
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}
