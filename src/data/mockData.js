// Centralized demo market data. Static values for UI only — not live prices.
export const instruments = [
  { symbol: "NIFTY 50", price: 22450.8, change: 1.24, volume: "182M", spark: [12,14,13,16,15,18,17,21,20,24] },
  { symbol: "BANKNIFTY", price: 48210.35, change: 0.86, volume: "96M", spark: [8,10,9,12,11,14,13,16,15,18] },
  { symbol: "SENSEX", price: 73840.12, change: 1.02, volume: "64M", spark: [10,12,11,14,13,15,16,18,17,20] },
  { symbol: "RELIANCE", price: 2987.45, change: 2.14, volume: "8.2M", spark: [5,7,6,9,8,11,10,13,12,15] },
  { symbol: "TCS", price: 4120.6, change: -0.42, volume: "3.1M", spark: [15,13,14,11,12,10,11,9,10,8] },
  { symbol: "INFY", price: 1784.25, change: 0.68, volume: "5.4M", spark: [9,10,9,11,10,12,11,13,12,14] },
  { symbol: "HDFCBANK", price: 1642.9, change: 1.56, volume: "11.8M", spark: [7,8,9,8,10,11,10,12,13,14] },
  { symbol: "BTC/USD", price: 97420.0, change: 3.42, volume: "28B", spark: [4,6,5,8,7,10,9,12,11,14] },
  { symbol: "ETH/USD", price: 3412.55, change: 2.08, volume: "12B", spark: [6,7,6,9,8,10,11,10,12,13] },
  { symbol: "USD/INR", price: 83.94, change: 0.06, volume: "—", spark: [10,10,11,10,11,11,12,11,12,12] },
];

export const chartSeries = Array.from({ length: 60 }, (_, i) => {
  const base = 22200 + i * 6 + Math.sin(i / 3) * 40 + (i > 40 ? (i - 40) * 4 : 0);
  return { t: `09:${String(15 + i).padStart(2, "0")}`, price: Math.round(base * 100) / 100, vol: Math.round(120 + Math.abs(Math.sin(i / 2)) * 300 + (i > 44 ? 260 : 0)) };
});

export const signals = [
  { id: 1, tag: "HIGH PROBABILITY", title: "NIFTY breakout detected", confidence: 87, momentum: "Strong", volume: "Above average", reasoning: "Price structure indicates a potential continuation after reclaiming the resistance zone.", time: "2m ago", tone: "bullish" },
  { id: 2, tag: "EMERGING SETUP", title: "BANKNIFTY momentum building", confidence: 72, momentum: "Moderate", volume: "Average", reasoning: "Higher lows forming under resistance. Model confidence rising on sustained volume.", time: "18m ago", tone: "bullish" },
  { id: 3, tag: "RISK ALERT", title: "TCS losing short-term support", confidence: 64, momentum: "Weak", volume: "Elevated", reasoning: "Support retest with expanding sell volume. Consider reduced exposure until structure stabilises.", time: "41m ago", tone: "bearish" },
  { id: 4, tag: "WATCH", title: "BTC volatility compression", confidence: 58, momentum: "Neutral", volume: "Below average", reasoning: "Range tightening historically precedes expansion. Direction unconfirmed.", time: "1h ago", tone: "neutral" },
];

// NOTE: The old hardcoded pricing tiers (Hunter / Awakened / Monarch) were
// removed from this file. Plan data now comes exclusively from the backend
// Plan catalogue via src/lib/plans.js — see src/pages/Pricing.jsx.

export const testimonials = [
  { quote: "It replaced three tabs I used to keep open all morning. The signal feed reads like an analyst sitting next to me.", name: "Derivatives trader", role: "NIFTY & BANKNIFTY, 6 yrs" },
  { quote: "The confidence framing is honest. It tells me when the model is unsure, which is exactly what I need before sizing a position.", name: "Quantitative analyst", role: "Systematic equities" },
  { quote: "Calm, fast, and dense where it matters. The terminal preview alone convinced our desk to trial it.", name: "Portfolio manager", role: "Multi-asset PMS" },
];

export const navLinks = [
  { label: "Markets", to: "/markets" },
  { label: "Trade", to: "/trade" },
  { label: "Features", to: "/solutions" },
  { label: "Live Sessions", to: "/live" },
  { label: "Community", to: "/community" },
  { label: "Pricing", to: "/pricing" },
];
