import { Component, Suspense, lazy, useState } from "react";
import { useReducedMotion } from "framer-motion";

// Decorative-only guard: if the lazy 3D chunk fails (blocked WebGL, GPU
// blocklist, chunk load error), hide the backdrop instead of crashing the
// whole React tree (which would leave a black screen).
class BackdropGuard extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {}
  render() { return this.state.failed ? null : this.props.children; }
}

// 3D backdrop is purely decorative — lazy-loaded, GPU-light, and skipped on
// touch devices, reduced-motion, or when WebGL is unavailable. It renders
// behind content with pointer-events disabled so it can never block charts.
const Scene = lazy(() => import("./NeonScene.jsx"));

export default function NeonBackdrop() {
  const reduced = useReducedMotion();
  // Capability probe runs once in a lazy initializer (window is guaranteed
  // client-side in this Vite SPA) — avoids a post-mount setState cascade.
  const [capable] = useState(() => {
    if (typeof window === "undefined") return false;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const small = window.innerWidth < 768;
    const webgl = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();
    return !coarse && !small && webgl;
  });

  if (reduced || !capable) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 opacity-[0.55]">
      <BackdropGuard><Suspense fallback={null}><Scene /></Suspense></BackdropGuard>
    </div>
  );
}
