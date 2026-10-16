import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, LineChart, ShieldCheck, Zap } from "lucide-react";
import { Container, Section, Reveal } from "../components/ui.jsx";
import GradientText from "../components/landing/GradientText.jsx";
import HeroTerminal from "../components/landing/HeroTerminal.jsx";
import MarketTicker from "../components/landing/MarketTicker.jsx";
import MarketOverview from "../components/landing/MarketOverview.jsx";
import FeatureBento from "../components/landing/FeatureBento.jsx";
import ChartShowcase from "../components/landing/ChartShowcase.jsx";
import CommunityLive from "../components/landing/CommunityLive.jsx";
import { useMarketPoll } from "../components/landing/useMarketPoll.js";

const TRUST = [
  { icon: Zap, label: "Real-time CoinGecko data" },
  { icon: LineChart, label: "Advanced charting engine" },
  { icon: ShieldCheck, label: "Secure Firebase + JWT accounts" },
];

const EASE = [0.22, 1, 0.36, 1];

function Hero({ coins, updatedAt, status, onRetry }) {
  const reduce = useReducedMotion();
  const glowRef = useRef(null);

  const onMove = (e) => {
    if (reduce || !glowRef.current || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    glowRef.current.style.setProperty("--gx", `${e.clientX - r.left}px`);
    glowRef.current.style.setProperty("--gy", `${e.clientY - r.top}px`);
    glowRef.current.style.opacity = "1";
  };
  const onLeave = () => { if (glowRef.current) glowRef.current.style.opacity = "0"; };

  const words1 = ["Trade", "the", "market."];
  const words2 = ["Master", "the", "moment."];

  return (
    <div
      className="slt-grid-bg relative overflow-hidden"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {/* pointer-reactive glow (desktop, fine pointer only) */}
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500"
        style={{ background: "radial-gradient(480px circle at var(--gx, 50%) var(--gy, 30%), rgba(82,120,255,0.10), transparent 70%)" }}
      />
      <Container className="grid items-center gap-12 pb-16 pt-28 md:pt-36 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
        <div>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="text-xs font-semibold tracking-[0.25em] text-cyan-300"
          >
            THE NEXT EVOLUTION OF CRYPTO TRADING
          </motion.p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-[#F4F7FF] sm:text-5xl lg:text-6xl">
            <span className="block" aria-label="Trade the market.">
              {words1.map((w, i) => (
                <motion.span
                  key={w} aria-hidden
                  className="mr-[0.25em] inline-block last:mr-0"
                  initial={reduce ? false : { opacity: 0, y: "0.6em" }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.08 + i * 0.07, ease: EASE }}
                >
                  {w}
                </motion.span>
              ))}
            </span>
            <span className="block" aria-label="Master the moment.">
              {words2.map((w, i) => (
                <motion.span
                  key={w} aria-hidden
                  className="mr-[0.25em] inline-block last:mr-0"
                  initial={reduce ? false : { opacity: 0, y: "0.6em" }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.07, ease: EASE }}
                >
                  <GradientText glow>{w}</GradientText>
                </motion.span>
              ))}
            </span>
          </h1>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.5, ease: EASE }}
            className="mt-5 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base"
          >
            Discover real-time crypto intelligence, powerful market visualizations, and a trading
            experience designed to help you move with confidence.
          </motion.p>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.62, ease: EASE }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <motion.span whileHover={reduce ? undefined : { y: -2 }} whileTap={reduce ? undefined : { scale: 0.98 }}>
              <Link
                to="/terminal"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 text-sm font-semibold text-black shadow-[0_8px_30px_rgba(77,235,255,0.25)] transition hover:shadow-[0_8px_40px_rgba(77,235,255,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                Start Trading <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </motion.span>
            <motion.span whileHover={reduce ? undefined : { y: -2 }} whileTap={reduce ? undefined : { scale: 0.98 }}>
              <Link
                to="/markets"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white backdrop-blur transition hover:border-cyan-400/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                Explore Markets
              </Link>
            </motion.span>
          </motion.div>
          <motion.ul
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-8 flex flex-wrap gap-x-6 gap-y-2"
            aria-label="Platform capabilities"
          >
            {TRUST.map((t) => (
              <li key={t.label} className="inline-flex items-center gap-1.5 text-xs text-white/50">
                <t.icon className="h-3.5 w-3.5 text-cyan-300" aria-hidden /> {t.label}
              </li>
            ))}
          </motion.ul>
        </div>
        <HeroTerminal coins={coins} updatedAt={updatedAt} status={status} onRetry={onRetry} />
      </Container>
    </div>
  );
}

export default function Landing() {
  const { coins, updatedAt, status, retry } = useMarketPoll({ limit: 25 });

  return (
    <div className="slt-page">
      <Hero coins={coins} updatedAt={updatedAt} status={status} onRetry={retry} />
      <MarketTicker coins={coins} />
      <Section><MarketOverview coins={coins} status={status} /></Section>
      <Section className="pt-0"><FeatureBento /></Section>
      <Section className="pt-0"><ChartShowcase /></Section>
      <Section className="pt-0"><CommunityLive /></Section>
      <Section className="pt-0">
        <Container>
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0D1220] via-[#111827] to-[#0D1220] px-6 py-14 text-center sm:px-12">
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_70%_at_50%_110%,rgba(82,120,255,0.22),transparent)]" />
              <p className="text-xs font-semibold tracking-[0.25em] text-cyan-300">GET STARTED</p>
              <h2 className="mx-auto mt-3 max-w-xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Your next move <GradientText>starts here.</GradientText>
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm text-white/60">
                Explore the markets with a trading workspace built for clarity, speed, and informed decisions.
              </p>
              <Link
                to="/terminal"
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                Explore the Platform <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </Reveal>
        </Container>
      </Section>
    </div>
  );
}
