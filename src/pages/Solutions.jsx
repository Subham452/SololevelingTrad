import { Container, Section, SectionHeading, Reveal, Card } from "../components/ui.jsx";
const items = [
  { t: "Intraday traders", c: "Second-level momentum, volume spikes and ranked 5-minute setups." },
  { t: "Swing traders", c: "Daily structure, support retests and multi-day continuation signals." },
  { t: "Desks & analysts", c: "Shared watchlists, audit-ready reasoning and exportable briefs." },
];
export default function Solutions() {
  return <Section><Container>
    <SectionHeading eyebrow="SOLUTIONS" title="One terminal, every trading style" copy="Pick your horizon — the intelligence layer adapts." />
    <div className="grid gap-4 md:grid-cols-3">{items.map((i) => <Reveal key={i.t}><Card><h3 className="font-medium">{i.t}</h3><p className="text-secondary mt-2 text-sm">{i.c}</p></Card></Reveal>)}</div>
  </Container></Section>;
}
