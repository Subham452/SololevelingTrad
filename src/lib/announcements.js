import { api } from "../lib/api.js";
export const announcementsApi = {
  feed: () => api.get("/announcements"),
  markRead: (id) => api.post(`/announcements/${id}/read`, {}),
  all: (p = {}) => { const q = new URLSearchParams(p).toString(); return api.get(`/announcements/admin/all${q ? `?${q}` : ""}`); },
  create: (b) => api.post("/announcements/admin", b),
  update: (id, b) => api.patch(`/announcements/admin/${id}`, b),
  remove: (id) => api.del(`/announcements/admin/${id}`),
};
