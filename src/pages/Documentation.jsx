import { Container, Section } from "../components/ui.jsx";
const nav = ["Quickstart", "Signals", "Scanner", "Alerts", "Risk", "API (soon)"];
export default function Documentation() {
  return <Section><Container>
    <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>
    <div className="mt-6 grid gap-8 lg:grid-cols-[180px_1fr_180px]">
      <aside className="hidden lg:block"><div className="sticky top-20 flex flex-col gap-1">{nav.map((n, i) => <a key={n} href={`#s${i}`} className="rounded-lg px-3 py-1.5 text-sm text-white/55 hover:bg-white/5 hover:text-white">{n}</a>)}</div></aside>
      <article className="min-w-0 text-sm leading-6 text-white/70">
        {nav.map((n, i) => (
          <section key={n} id={`s${i}`} className="mb-8"><h2 className="mb-2 text-lg font-medium text-white">{n}</h2>
          <p>Demo documentation for {n.toLowerCase()}. Connect your data feed, pin a watchlist, and subscribe to signal webhooks. All content here is illustrative — real credentials and endpoints ship with your workspace.</p></section>
        ))}
      </article>
      <aside className="hidden lg:block"><div className="sticky top-20 rounded-2xl border border-white/10 p-4 text-xs text-white/50">On this page<ul className="mt-2 flex flex-col gap-1">{nav.map((n) => <li key={n}>{n}</li>)}</ul></div></aside>
    </div>
  </Container></Section>;
}
