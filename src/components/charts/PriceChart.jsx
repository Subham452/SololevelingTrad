import { useEffect, useMemo, useRef } from "react";
import {
  createChart, CandlestickSeries, AreaSeries, LineSeries, HistogramSeries,
  ColorType, CrosshairMode, LineStyle,
} from "lightweight-charts";
import { useReducedMotion } from "framer-motion";

const UP = "#10b981", DOWN = "#f43f5e";
const ACCENT = "#22d3ee";

// Neon-themed defaults. Deliberately restrained — only the price line and
// last-value label carry glow; grid stays thin and quiet.
const baseLayout = (reduced) => ({
  background: { type: ColorType.Solid, color: "transparent" },
  textColor: "rgba(226,232,240,0.6)",
  fontSize: 11,
  fontFamily: "'Inter', system-ui, sans-serif",
  attributionLogo: false,
  ...(reduced ? {} : { animation: true }),
});

const gridOpts = (visible) => ({
  vertLines: { visible, color: "rgba(148,163,184,0.06)" },
  horzLines: { visible, color: "rgba(148,163,184,0.06)" },
});

/**
 * PriceChart — TradingView Lightweight Charts v5.
 * props:
 *   mode: 'candle' | 'area' | 'line' | 'ohlc'
 *   candles: [{time,open,high,low,close}]  (real OHLC only — never synthesized)
 *   series:  [{time,value}]                (price series, e.g. CoinGecko market_chart)
 *   volumes: [{time,value}]                (real volume or absent)
 *   overlays: [{id,values,color,label}]    (aligned by index to `series`)
 *   showGrid, reduced
 */
export default function PriceChart({
  mode = "area", candles = null, series = null, volumes = null,
  overlays = [], showGrid = true, height = 420, onCrosshair,
}) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const mainRef = useRef(null);
  const volRef = useRef(null);
  const subRef = useRef({});
  const reduced = useReducedMotion();
  const reduce = !!reduced;

  // --- create chart once -------------------------------------------------
  useEffect(() => {
    if (!wrapRef.current) return;
    const chart = createChart(wrapRef.current, {
      height,
      layout: baseLayout(reduce),
      grid: gridOpts(showGrid),
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(34,211,238,0.5)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#22d3ee" },
        horzLine: { color: "rgba(34,211,238,0.5)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#22d3ee" },
      },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)", scaleMargins: { top: 0.12, bottom: 0.22 } },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      handleScroll: true, handleScale: true,
    });
    chart.subscribeCrosshairMove((p) => {
      if (!onCrosshair) return;
      if (!p || p.point == null || !p.time) { onCrosshair(null); return; }
      const s = mainRef.current?.data?.find?.((d) => d.time === p.time) || null;
      onCrosshair({ time: p.time, data: s, point: p.point });
    });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: wrapRef.current?.clientWidth || undefined });
    });
    ro.observe(wrapRef.current);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; mainRef.current = null; volRef.current = null; subRef.current = {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- grid visibility ---------------------------------------------------
  useEffect(() => { chartRef.current?.applyOptions({ grid: gridOpts(showGrid) }); }, [showGrid]);

  // --- data + mode -------------------------------------------------------
  const usingCandles = useMemo(() => mode === "candle" || mode === "ohlc", [mode]);
  const priceData = useMemo(() => {
    if (usingCandles && candles?.length) return candles;
    return series || [];
  }, [usingCandles, candles, series]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // teardown previous series
    if (mainRef.current) { try { chart.removeSeries(mainRef.current); } catch {} mainRef.current = null; }
    if (volRef.current) { try { chart.removeSeries(volRef.current); } catch {} volRef.current = null; }
    Object.values(subRef.current).forEach((s) => { try { chart.removeSeries(s); } catch {} });
    subRef.current = {};

    if (!priceData?.length) return;

    if (usingCandles && candles?.length) {
      mainRef.current = chart.addSeries(CandlestickSeries, {
        upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN,
        wickUpColor: UP, wickDownColor: DOWN,
        priceLineColor: ACCENT, priceLineWidth: 1, priceLineStyle: LineStyle.Dotted,
        lastValueVisible: true,
      }, 0);
      mainRef.current.setData(candles);
    } else if (mode === "line") {
      mainRef.current = chart.addSeries(LineSeries, {
        color: ACCENT, lineWidth: 2, priceLineColor: ACCENT, lastValueVisible: true,
        crosshairMarkerVisible: true, crosshairMarkerBorderColor: "#0b1120", crosshairMarkerBackgroundColor: ACCENT,
      }, 0);
      mainRef.current.setData(priceData);
    } else {
      mainRef.current = chart.addSeries(AreaSeries, {
        lineColor: ACCENT, lineWidth: 2, priceLineColor: ACCENT, lastValueVisible: true,
        topColor: "rgba(34,211,238,0.28)", bottomColor: "rgba(34,211,238,0.00)",
        crosshairMarkerVisible: true, crosshairMarkerBorderColor: "#0b1120", crosshairMarkerBackgroundColor: ACCENT,
      }, 0);
      mainRef.current.setData(priceData);
    }

    // volume on a hidden scale under price
    if (volumes?.length) {
      volRef.current = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false,
      }, 0);
      volRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volRef.current.setData(volumes.map((v) => ({ ...v, color: v.color || "rgba(99,102,241,0.35)" })));
    }

    // overlays (SMA/EMA/Bollinger/VWAP) aligned to the price series
    overlays.forEach((o) => {
      if (!o?.values?.length) return;
      const pts = (series || []).map((p, i) => (o.values[i] != null ? { time: p.time, value: o.values[i] } : null)).filter(Boolean);
      if (!pts.length) return;
      const s = chart.addSeries(LineSeries, { color: o.color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false }, 0);
      s.setData(pts);
    });

    chart.timeScale().fitContent();
  }, [priceData, mode, overlays, volumes, series, candles, usingCandles]);

  // --- sub panels (RSI / MACD) — derived from series index alignment ------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !series?.length || !overlays.length) return;
    const clean = () => { Object.values(subRef.current).forEach((s) => { try { chart.removeSeries(s); } catch {} }); subRef.current = {}; };
    clean();
    overlays.filter((o) => o.panel === "sub").forEach((o, idx) => {
      const pane = idx + 1;
      const pts = (o.lines || []).flatMap((ln) =>
        series.map((p, i) => (ln.values[i] != null ? { time: p.time, value: ln.values[i], color: ln.color } : null)).filter(Boolean)
      );
      if (!pts.length) return;
      const s = chart.addSeries(o.kind === "hist" ? HistogramSeries : LineSeries, {
        color: o.color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
        ...(o.kind === "hist" ? { priceFormat: { type: "price", precision: 2, minMove: 0.01 } } : {}),
      }, pane);
      s.getPane().setHeight(90);
      s.setData(pts);
      subRef.current[o.id] = s;
      (o.bands || []).forEach((b, bi) => {
        const bp = series.map((p, i) => (b.values[i] != null ? { time: p.time, value: b.values[i] } : null)).filter(Boolean);
        if (bp.length) {
          const bs = chart.addSeries(LineSeries, { color: b.color, lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false }, pane);
          bs.setData(bp);
          subRef.current[`${o.id}-band-${bi}`] = bs;
        }
      });
    });
  }, [series, overlays]);

  return <div ref={wrapRef} className="w-full" style={{ height }} aria-label="Price chart" />;
}
