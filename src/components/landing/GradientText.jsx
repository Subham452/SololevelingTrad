import { cn } from "../../lib/utils.js";

// Gradient text with a masked sweep on hover/focus. Pure CSS — cheap, and
// text stays readable when hover is unavailable (touch/keyboard show the
// base color; focus-visible triggers the gradient too).
export default function GradientText({ children, className, glow = false }) {
  return (
    <span
      className={cn(
        "slt-gradient-text bg-[linear-gradient(100deg,#4DEBFF,#5278FF_45%,#9867FF_75%,#F06BFF)] bg-[length:200%_100%] bg-left bg-clip-text text-transparent",
        "transition-[background-position] duration-700 ease-out",
        "hover:bg-right focus-visible:bg-right",
        glow && "hover:[filter:drop-shadow(0_0_18px_rgba(82,120,255,0.35))]",
        className
      )}
    >
      {children}
    </span>
  );
}
