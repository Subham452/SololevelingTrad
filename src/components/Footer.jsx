import { Link } from "react-router-dom";
import { BrandMark, BrandWordmark } from "./Brand.jsx";

const cols = {
  Product: [["Markets", "/markets"], ["Terminal", "/terminal"], ["Trade", "/trade"], ["Pricing", "/pricing"]],
  Community: [["Community", "/community"], ["Rooms", "/rooms"], ["Live Sessions", "/live"]],
  Resources: [["Documentation", "/documentation"], ["Solutions", "/solutions"], ["Signals", "/signals"]],
  Account: [["Sign In", "/login"], ["Get Started", "/register"], ["Portfolio", "/portfolio"], ["Subscription", "/subscription"]],
};

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-transparent">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-5">
          <div className="md:col-span-1">
            <Link to="/" className="inline-flex items-center gap-2" aria-label="SololevelingTrad home">
              <BrandMark size={26} />
              <BrandWordmark />
            </Link>
            <p className="mt-2 text-xs text-white/50">Market intelligence for disciplined traders.</p>
          </div>
          {Object.entries(cols).map(([h, links]) => (
            <div key={h}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">{h}</p>
              <ul className="space-y-2">
                {links.map(([label, to]) => (
                  <li key={label + to}><Link to={to} className="text-sm text-white/60 hover:text-white">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-10 text-xs leading-relaxed text-white/40">
          Risk disclosure: Trading in securities and derivatives involves substantial risk of loss and is not suitable for every investor. Past performance is not indicative of future results. All signals and analytics are for informational purposes only and do not constitute investment advice.
        </p>
        <p className="mt-2 text-xs text-white/40">Trading involves risk. Please read the risk disclosure carefully.</p>
        <div className="mt-6 flex flex-col justify-between gap-2 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row">
          <p>© 2026 SololevelingTrad. All rights reserved.</p>
          <p>Not financial advice.</p>
        </div>
      </div>
    </footer>
  );
}
