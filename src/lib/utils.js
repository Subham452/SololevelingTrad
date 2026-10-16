import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs) { return twMerge(clsx(...inputs)); }
export function formatINR(n) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
export function pct(n) { return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`; }
