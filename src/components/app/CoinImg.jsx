import { useState } from "react";
import { cn } from "../../lib/utils.js";

/** Coin logo with a graceful symbol-fallback when the image is missing. */
export default function CoinImg({ src, symbol, size = "h-7 w-7", text = "text-[10px]" }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-white/10 font-bold uppercase text-white/60", size, text)}>
        {String(symbol || "?").slice(0, 2)}
      </span>
    );
  }
  return <img src={src} alt="" loading="lazy" className={cn("shrink-0 rounded-full", size)} onError={() => setErr(true)} />;
}
