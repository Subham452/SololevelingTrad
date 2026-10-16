import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Card, Button, EmptyState } from "../components/ui.jsx";
import { SkeletonLoader } from "../components/Loaders.jsx";

export default function Purchases() {
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  useEffect(() => {
    setItems(null); setError("");
    api.get(`/payments/me?page=${page}&limit=10`).then((d) => setItems(d?.items || d?.payments || [])).catch((e) => {
      if (e?.status === 0) setItems([]);
      else { setError(e.message || "Failed to load"); setItems([]); }
    });
  }, [page]);
  return <div className="mx-auto max-w-2xl space-y-4">
    <h2 className="font-display text-xl font-bold tracking-tight text-white">Purchases</h2>
    {items === null ? <SkeletonLoader rows={3} /> :
      error ? <Card error={error} /> :
      items.length === 0 ? <EmptyState title="No purchases yet" desc="Backend offline or no orders — showing empty state." /> :
      <div className="space-y-2">{items.map((p, i) => <Card key={p.id || i} className="bg-white/[0.02]"><p className="text-sm">{p.plan || p.description || "Order"}</p><p className="text-xs text-white/50">{p.amount} · {p.status} · {p.createdAt}</p></Card>)}</div>}
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
      <span className="px-2 py-1 text-xs text-white/50">Page {page}</span>
      <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)}>Next</Button>
    </div>
  </div>;
}
