import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { api } from "../lib/api.js";

export default function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!open) return;
    api.get("/users/me/notifications").then((d) => setItems(d?.notifications || d || [])).catch(() => setItems([]));
  }, [open ]);
  const unread = items.filter((n) => !n.read).length;
  const markRead = async (id) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try { await api.post(`/users/me/notifications/${id}/read`, {}); } catch {}
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="relative rounded-full border border-white/10 p-2 text-white/60 hover:text-white" aria-label="Notifications" aria-expanded={open}>
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-500" />}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-white/10 bg-black/90 p-2 backdrop-blur-xl" role="menu">
          {items.length === 0 ? <p className="px-3 py-6 text-center text-xs text-white/50">No notifications.</p> :
            items.slice(0, 8).map((n) => (
              <div key={n.id || n._id} className="flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-xs hover:bg-white/5">
                <div><p className="text-white/80">{n.title || n.message}</p>{n.createdAt && <p className="text-white/30">{new Date(n.createdAt).toLocaleString()}</p>}</div>
                {!n.read && <button onClick={() => markRead(n.id || n._id)} aria-label="Mark read" className="text-blue-400"><Check size={14} /></button>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
